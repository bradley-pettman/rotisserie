/**
 * Scrape a recipe from a public URL.
 *
 * Extraction order:
 *   1. JSON-LD  (`<script type="application/ld+json">`) — primary path.
 *   2. Microdata (`itemtype="...schema.org/Recipe"` + `itemprop`) — best-effort
 *      fallback for sites that never adopted JSON-LD.
 *   3. Otherwise throw `"Could not find recipe data on this page."`.
 *
 * No npm dependencies: Node's built-in `fetch` plus regex-based HTML handling.
 * The regex HTML handling is deliberately shallow — it is a scraper, not a
 * parser, and every field is optional so a partial extraction still returns a
 * usable draft for the import form.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { parseDuration } from "~/features/recipes/lib/parse-duration";
import { parseIngredient } from "~/features/recipes/lib/parse-ingredient";

/** One ingredient row, shaped for the recipe form's ingredient editor. */
export type ScrapedIngredient = {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  /**
   * Preparation notes, or null when the line carries none. Schema.org gives one
   * freeform string per ingredient with no separate notes field, so this is
   * whatever `parseIngredient` splits off the name: a trailing comma clause
   * ("…, finely chopped") and/or parenthetical content ("(14.5 ounce)").
   * Keeping it out of `ingredientName` matters because the name is upserted
   * into the shared `ingredients` lookup table, where every prep variation
   * would otherwise become its own row.
   */
  notes: string | null;
};

/** A recipe draft scraped from a page, shaped to populate the new-recipe form. */
export type ScrapedRecipe = {
  name: string | null;
  instructions: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  sourceUrl: string;
  notes: string | null;
  ingredients: ScrapedIngredient[];
};

const USER_AGENT = "Mozilla/5.0 (compatible; Rotisserie/1.0)";
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Ceilings on what one import is allowed to cost.
 *
 * These are not tuning knobs, they are the bound that keeps a single request
 * from occupying the process. Node runs this parser on the same thread that
 * serves every other request, so an import that spends 30 seconds in a regex
 * is 30 seconds in which the app serves nobody -- and several of the HTML
 * scanners below are quadratic in the length of their input.
 *
 * 1 MB is far past any real recipe page (a heavy one is ~300 KB) and far below
 * the size at which the scanners become a problem. The item caps are the same
 * idea one level up: a page claiming 100k ingredients is not a recipe, and
 * every one of them would otherwise become its own row and its own round trip.
 */
const MAX_HTML_BYTES = 1_000_000;
const MAX_HTML_CHARS = 1_000_000;
const MAX_REDIRECTS = 3;
const MAX_INGREDIENTS = 200;
const MAX_INSTRUCTION_STEPS = 200;

/** The widest run of tag-internal text any scanner will backtrack across. */
const ATTR = "[^>]{0,2000}";
const NO_RECIPE_FOUND = "Could not find recipe data on this page.";

/* -------------------------------------------------------------------------- */
/* HTML text handling                                                          */
/* -------------------------------------------------------------------------- */

/** Named entities worth decoding. Anything unrecognized is left verbatim. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // Decoded to a plain space (not U+00A0) so it collapses with the whitespace
  // around it — scraped markup is full of `&nbsp;` used purely for layout.
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  deg: "°",
  frac12: "½",
  frac13: "⅓",
  frac14: "¼",
  frac23: "⅔",
  frac34: "¾",
};

/** Tags whose boundaries are line breaks rather than nothing. */
const BLOCK_TAGS =
  "br|p|div|li|tr|section|article|ul|ol|table|h1|h2|h3|h4|h5|h6|blockquote";

function decodeEntities(text: string): string {
  // One pass only: `&amp;lt;` must decode to `&lt;`, not to `<`.
  return text.replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, body: string) => {
      if (body.startsWith("#")) {
        const isHex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(
          isHex ? body.slice(2) : body.slice(1),
          isHex ? 16 : 10,
        );
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      const named = NAMED_ENTITIES[body.toLowerCase()];
      return named === undefined ? whole : named;
    },
  );
}

/**
 * Strip HTML tags, decode entities and normalize whitespace.
 *
 * Block-level tags collapse to newlines so `<p>a</p><p>b</p>` does not become
 * `ab`; inline tags (`<b>`, `<a>`) are simply dropped so `<b>flour</b>, sifted`
 * stays `flour, sifted` without a stray space before the comma.
 */
/**
 * Remove `<script>` and `<style>` elements, bodies included, in one pass.
 *
 * Deliberately index-based rather than a regex: see the note at the call site.
 * An unterminated or unclosed element drops everything from it onward, which is
 * the safe reading — whatever follows an unclosed `<script>` was never prose.
 */
function stripScriptStyle(html: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let cursor = 0;

  for (;;) {
    let start = -1;
    let closing = "";

    for (const [open, close] of [
      ["<script", "</script"],
      ["<style", "</style"],
    ] as const) {
      const at = lower.indexOf(open, cursor);
      if (at !== -1 && (start === -1 || at < start)) {
        start = at;
        closing = close;
      }
    }

    if (start === -1) return out + html.slice(cursor);

    out += html.slice(cursor, start);

    const openEnd = html.indexOf(">", start);
    if (openEnd === -1) return out;

    const closeStart = lower.indexOf(closing, openEnd);
    if (closeStart === -1) return out;

    const closeEnd = html.indexOf(">", closeStart);
    if (closeEnd === -1) return out;

    out += " ";
    cursor = closeEnd + 1;
  }
}

export function stripHtml(html: string): string {
  if (!html) return "";

  let text = String(html);

  // Script/style bodies are code, not prose — drop them wholesale. Done by
  // scanning rather than by regex: the obvious pattern
  // (`<(script|style)\b[^>]*>[\s\S]*?<\/\1>`) is quadratic on input that opens
  // tags and never closes them, because each of the N start positions rescans
  // to end-of-input before failing. Measured: 512 KB of `"<script "` took 30
  // seconds, on the same thread that serves every other request.
  text = stripScriptStyle(text);

  // Everything past the final `>` cannot contain a complete tag, so the tag
  // patterns below are run only on the part that can. This is what keeps them
  // linear: within `head` every `<` has a `>` somewhere ahead, so each match
  // succeeds and advances instead of failing after a full scan. Without the
  // split, `"<br".repeat(60000)` spent 8 seconds proving there was no `>`.
  const lastGt = text.lastIndexOf(">");
  const head = lastGt === -1 ? "" : text.slice(0, lastGt + 1);
  const tail = lastGt === -1 ? text : text.slice(lastGt + 1);

  let stripped = head;
  stripped = stripped.replace(/<!--[\s\S]{0,50000}?-->/g, " ");
  stripped = stripped.replace(new RegExp(`<\\s*(?:${BLOCK_TAGS})\\b${ATTR}>`, "gi"), "\n");
  stripped = stripped.replace(new RegExp(`<\\s*/\\s*(?:${BLOCK_TAGS})\\s*>`, "gi"), "\n");
  stripped = stripped.replace(new RegExp(`<${ATTR}>`, "g"), "");

  // The tail holds no complete tag, but it can still hold a dangling `<foo`
  // that would otherwise read as prose. Drop from the last unmatched `<`.
  const dangling = tail.indexOf("<");
  text = stripped + (dangling === -1 ? tail : tail.slice(0, dangling));

  text = decodeEntities(text);

  // Collapse horizontal whitespace but keep paragraph structure.
  text = text.replace(/[^\S\n]+/g, " ");
  text = text.replace(/[^\S\n]*\n[^\S\n]*/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/** `stripHtml` for values that must stay on one line (titles, ingredients). */
function stripHtmlInline(html: string): string {
  return stripHtml(html).replace(/\s+/g, " ").trim();
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/* -------------------------------------------------------------------------- */
/* Generic value coercion                                                      */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keys schema.org uses to wrap a scalar inside an object. */
const WRAPPER_KEYS = ["@value", "value", "text", "name"] as const;

/** First scalar reachable from `value`, unwrapping arrays and value objects. */
function firstString(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (depth >= 5) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  if (isRecord(value)) {
    for (const key of WRAPPER_KEYS) {
      if (key in value) {
        const found = firstString(value[key], depth + 1);
        if (found !== null) return found;
      }
    }
  }

  return null;
}

/** Flatten `value` into a list of scalars (arrays, nested arrays, wrappers). */
function toStringArray(value: unknown, depth = 0): string[] {
  if (depth >= 5) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toStringArray(entry, depth + 1));
  }

  if (isRecord(value)) {
    const found = firstString(value, depth + 1);
    return found === null ? [] : [found];
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* JSON-LD extraction                                                          */
/* -------------------------------------------------------------------------- */

// `\s` before `type` so that `data-type="application/ld+json"` does not match.
// Applied to ONE tag's attributes at a time (see `jsonLdBlocks`), never scanned
// across the document: as a document-wide pattern the two `[^>]*` runs around
// it were quadratic, and `"<script ".repeat(60000)` measured 27 seconds.
const JSON_LD_TYPE = /(^|\s)type\s*=\s*["']?application\/ld\+json["']?/i;

/** The body of every `<script type="application/ld+json">`, in document order. */
function* jsonLdBlocks(html: string): Generator<string> {
  // Lowercased ONCE, outside the loop: doing it per block would reintroduce
  // quadratic behaviour by the back door, in the number of script tags.
  const lower = html.toLowerCase();

  for (const tag of eachTag(html)) {
    if (tag.closing || tag.tag !== "script") continue;
    if (!JSON_LD_TYPE.test(tag.attrs)) continue;

    const close = lower.indexOf("</script", tag.end);
    if (close === -1) return; // unterminated: nothing usable follows

    yield unwrapScriptBody(html.slice(tag.end, close));
  }
}

/** Unwrap the CDATA / comment jackets sites wrap around inline JSON. */
function unwrapScriptBody(raw: string): string {
  return raw
    .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, "")
    .replace(/\/\*\s*\]\]>\s*\*\//g, "")
    .replace(/\/\/\s*<!\[CDATA\[/g, "")
    .replace(/\/\/\s*\]\]>/g, "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .trim();
}

/** True when a schema.org `@type` is (or includes) `Recipe`. */
function isRecipeType(type: unknown): boolean {
  if (typeof type === "string") {
    // Tolerates "Recipe", "schema:Recipe" and "https://schema.org/Recipe".
    const bare = type.split(/[/#:]/).pop() ?? type;
    return bare.trim().toLowerCase() === "recipe";
  }
  if (Array.isArray(type)) return type.some(isRecipeType);
  return false;
}

/**
 * Depth-first search for a Recipe node. Covers the shapes seen in the wild:
 * a bare object, a top-level array, an `@graph` array, and a Recipe buried
 * under `mainEntity` / `mainEntityOfPage` / `itemListElement`.
 */
function findRecipeNode(
  value: unknown,
  seen: Set<object>,
  depth = 0,
): Record<string, unknown> | null {
  if (depth >= 8 || value === null || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecipeNode(entry, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const node = value as Record<string, unknown>;
  if (isRecipeType(node["@type"])) return node;

  for (const nested of Object.values(node)) {
    if (nested !== null && typeof nested === "object") {
      const found = findRecipeNode(nested, seen, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Parse every JSON-LD block and return the first Recipe found.
 *
 * Pages routinely ship several blocks and some are invalid (truncated by a CMS,
 * containing a stray template placeholder). A block that fails to parse is
 * skipped so one bad block can never abort the scrape.
 */
function extractJsonLdRecipe(html: string): Record<string, unknown> | null {
  for (const body of jsonLdBlocks(html)) {
    if (!body) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue; // Malformed block — try the next one.
    }

    const recipe = findRecipeNode(parsed, new Set());
    if (recipe) return recipe;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Microdata extraction                                                        */
/* -------------------------------------------------------------------------- */

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function readAttribute(attrs: string, name: string): string | null {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"),
  );
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

type Tag = {
  tag: string;
  attrs: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
  end: number;
};

/**
 * Walk every tag in `html`, left to right, in linear time.
 *
 * THIS REPLACES A FAMILY OF QUADRATIC REGEXES. The scanners below all used to
 * look like `<([a-z][a-z0-9-]*)\b([^>]*\bitemscope\b[^>]*)>` -- two unbounded
 * runs around a literal. On input that opens tags without closing them, every
 * start position rescans to end-of-input before failing: `"<a ".repeat(60000)`
 * measured 11 SECONDS in that one pattern, on the thread that serves every
 * other request.
 *
 * Finding `<` then the next `>` with `indexOf` cannot backtrack, so the whole
 * document is one pass regardless of how the markup is shaped. Callers filter
 * on `attrs` themselves, which is both faster and easier to read than encoding
 * the predicate into the pattern.
 */
function* eachTag(html: string, from = 0): Generator<Tag> {
  let cursor = from;

  for (;;) {
    const lt = html.indexOf("<", cursor);
    if (lt === -1) return;

    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) return; // no complete tag remains

    cursor = gt + 1;

    const raw = html.slice(lt + 1, gt);
    const name = /^(\/?)\s*([a-z][a-z0-9-]*)/i.exec(raw);
    if (!name) continue; // a comment, a doctype, or stray punctuation

    yield {
      tag: name[2].toLowerCase(),
      attrs: raw.slice(name[0].length),
      closing: name[1] === "/",
      selfClosing: /\/\s*$/.test(raw),
      start: lt,
      end: gt + 1,
    };
  }
}

/**
 * Index just past the element opened at `contentStart`, by counting nested
 * open/close tags of the same name.
 */
function findElementEnd(html: string, tag: string, contentStart: number): number {
  if (!/^[a-z][a-z0-9-]*$/i.test(tag)) return html.length;

  const wanted = tag.toLowerCase();
  let depth = 1;

  for (const found of eachTag(html, contentStart)) {
    if (found.tag !== wanted) continue;

    if (found.closing) {
      depth -= 1;
      if (depth === 0) return found.start;
    } else if (!found.selfClosing) {
      depth += 1;
    }
  }

  return html.length;
}

type MicrodataElement = { tag: string; attrs: string; inner: string };

/** The recipe subtree: from the `itemtype="…/Recipe"` element to its close tag. */
const RECIPE_ITEMTYPE = /\bitemtype\s*=\s*["'][^"']*schema\.org\/Recipe[^"']*["']/i;

function extractRecipeScope(html: string): string | null {
  for (const found of eachTag(html)) {
    if (found.closing || !RECIPE_ITEMTYPE.test(found.attrs)) continue;
    if (VOID_TAGS.has(found.tag)) return null;

    return html.slice(found.end, findElementEnd(html, found.tag, found.end));
  }

  return null;
}

/**
 * Byte ranges of nested `itemscope` elements inside the recipe scope. An
 * `itemprop` inside one of these belongs to a sub-item (author, nutrition,
 * aggregateRating) and must not be read as a recipe property — otherwise the
 * author's `itemprop="name"` is mistaken for the recipe title.
 */
function nestedScopeRanges(scope: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (const found of eachTag(scope)) {
    if (found.closing || !/\bitemscope\b/i.test(found.attrs)) continue;
    if (VOID_TAGS.has(found.tag)) continue;

    ranges.push([found.start, findElementEnd(scope, found.tag, found.end)]);
  }

  return ranges;
}

function withinAny(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** Every element in `scope` carrying `itemprop="…prop…"`, outermost-first. */
function findItemprops(
  scope: string,
  prop: string,
  nested: Array<[number, number]>,
): MicrodataElement[] {
  const wanted = new RegExp(
    `\\bitemprop\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["']`,
    "i",
  );

  const found: MicrodataElement[] = [];

  for (const element of eachTag(scope)) {
    if (element.closing || !wanted.test(element.attrs)) continue;
    if (withinAny(element.start, nested)) continue;

    const inner = VOID_TAGS.has(element.tag)
      ? ""
      : scope.slice(element.end, findElementEnd(scope, element.tag, element.end));

    found.push({ tag: element.tag, attrs: element.attrs, inner });

    // A page claiming thousands of elements for one property is not a recipe,
    // and each of these costs a nested scan. Bound it.
    if (found.length >= MAX_INGREDIENTS) break;
  }

  return found;
}

/** Resolve a microdata element to its value, per the element-type rules. */
function microdataValue(element: MicrodataElement): string | null {
  const { tag, attrs, inner } = element;

  if (tag === "meta") return nonEmpty(readAttribute(attrs, "content"));
  if (tag === "link") return nonEmpty(readAttribute(attrs, "href"));
  if (tag === "time") {
    return nonEmpty(readAttribute(attrs, "datetime")) ?? nonEmpty(stripHtmlInline(inner));
  }

  return nonEmpty(stripHtmlInline(inner)) ?? nonEmpty(readAttribute(attrs, "content"));
}

/**
 * Best-effort microdata extraction, normalized into the same shape as a JSON-LD
 * node so both paths share one mapper.
 */
function extractMicrodataRecipe(html: string): Record<string, unknown> | null {
  const scope = extractRecipeScope(html);
  if (scope === null) return null;

  const nested = nestedScopeRanges(scope);
  const single = (prop: string): string | null => {
    for (const element of findItemprops(scope, prop, nested)) {
      const value = microdataValue(element);
      if (value !== null) return value;
    }
    return null;
  };
  const many = (prop: string): string[] =>
    findItemprops(scope, prop, nested)
      .map(microdataValue)
      .filter((value): value is string => value !== null);

  const node: Record<string, unknown> = {};

  const name = single("name");
  if (name !== null) node.name = name;

  const description = single("description");
  if (description !== null) node.description = description;

  for (const prop of ["prepTime", "cookTime"] as const) {
    const value = single(prop);
    if (value !== null) node[prop] = value;
  }

  const recipeYield = single("recipeYield") ?? single("yield");
  if (recipeYield !== null) node.recipeYield = recipeYield;

  const ingredients = [...many("recipeIngredient"), ...many("ingredients")];
  if (ingredients.length > 0) node.recipeIngredient = ingredients;

  // One element per step, or a single element wrapping an <ol>/<ul> of steps.
  const instructionElements = findItemprops(scope, "recipeInstructions", nested);
  if (instructionElements.length === 1 && /<li\b/i.test(instructionElements[0].inner)) {
    const steps: string[] = [];
    const items = instructionElements[0].inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi);
    for (const item of items) {
      const text = nonEmpty(stripHtmlInline(item[1] ?? ""));
      if (text !== null) steps.push(text);
    }
    if (steps.length > 0) node.recipeInstructions = steps;
  }

  if (node.recipeInstructions === undefined) {
    const steps = instructionElements
      .map(microdataValue)
      .filter((value): value is string => value !== null);
    if (steps.length > 0) node.recipeInstructions = steps;
  }

  // An `itemtype` alone is not a recipe; require at least one real field.
  return Object.keys(node).length > 0 ? node : null;
}

/* -------------------------------------------------------------------------- */
/* Schema.org -> ScrapedRecipe                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Flatten `recipeInstructions` into a list of step strings.
 *
 * Handles every shape seen in the wild: a single HTML string, an array of
 * strings, an array of `HowToStep` objects with `.text`, and — the shape the
 * original spec missed — an array of `HowToSection` objects whose steps live in
 * a nested `itemListElement` array. Section *names* are intentionally dropped:
 * the contract is a flat list of steps joined with a blank line.
 */
function collectInstructionSteps(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth >= 6 || value === null || value === undefined) return out;

  if (typeof value === "string") {
    // A single string may itself be an HTML list of steps.
    if (/<li\b/i.test(value)) {
      for (const item of value.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) {
        const text = nonEmpty(stripHtmlInline(item[1] ?? ""));
        if (text !== null) out.push(text);
      }
      if (out.length > 0) return out;
    }
    const text = nonEmpty(stripHtml(value));
    if (text !== null) out.push(text);
    return out;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectInstructionSteps(entry, depth + 1, out);
    return out;
  }

  if (isRecord(value)) {
    // A HowToSection carries its steps in itemListElement, never in `text`.
    const type = typeof value["@type"] === "string" ? value["@type"].toLowerCase() : "";
    const isSection = type.includes("howtosection") || type.includes("itemlist");

    if (!isSection) {
      const text = firstString(value["text"]) ?? firstString(value["name"]);
      const cleaned = nonEmpty(stripHtml(text ?? ""));
      if (cleaned !== null) {
        out.push(cleaned);
        return out;
      }
    }

    if (value["itemListElement"] !== undefined) {
      collectInstructionSteps(value["itemListElement"], depth + 1, out);
      return out;
    }

    const fallback = nonEmpty(stripHtml(firstString(value) ?? ""));
    if (fallback !== null) out.push(fallback);
  }

  return out;
}

/**
 * Minutes from an ISO 8601 duration field.
 *
 * `parseDuration`'s regex is anchored, so a value padded with whitespace (which
 * pretty-printed JSON-LD and `datetime` attributes both produce) would otherwise
 * be rejected outright. Trim before handing it over.
 */
function durationMinutes(value: unknown): number | null {
  const raw = firstString(value);
  return raw === null ? null : parseDuration(raw.trim());
}

/**
 * Servings from `recipeYield`, which may be a string ("4 servings", "Serves 6"),
 * a number, an array (`["4", "4 servings"]`) or a QuantitativeValue object.
 * Takes the first integer found, so both "4 servings" and "Serves 4" work.
 */
function parseServings(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const servings = parseServings(entry);
      if (servings !== null) return servings;
    }
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }

  const text = firstString(value);
  if (text === null) return null;

  const match = stripHtmlInline(text).match(/\d+/);
  if (!match) return null;

  const servings = Number.parseInt(match[0], 10);
  return Number.isFinite(servings) && servings > 0 ? servings : null;
}

/** Map a schema.org Recipe node onto the form's draft shape. */
function toScrapedRecipe(node: Record<string, unknown>, sourceUrl: string): ScrapedRecipe {
  const name = nonEmpty(stripHtmlInline(firstString(node["name"]) ?? ""));
  const notes = nonEmpty(stripHtml(firstString(node["description"]) ?? ""));

  // Both lists are capped. A page offering thousands of "ingredients" is not a
  // recipe, and each one becomes a row plus two or three SQL round trips inside
  // a single transaction on save -- so an uncapped import is a way to hold a
  // database connection open for minutes. 200 is far past any real recipe.
  const steps = collectInstructionSteps(node["recipeInstructions"]).slice(
    0,
    MAX_INSTRUCTION_STEPS,
  );
  const instructions = steps.length > 0 ? steps.join("\n\n") : null;

  // `ingredients` is the pre-2017 schema.org spelling; some sites still emit it.
  const rawIngredients = node["recipeIngredient"] ?? node["ingredients"];
  const ingredients = toStringArray(rawIngredients)
    .map(stripHtmlInline)
    .filter((line) => line !== "")
    .slice(0, MAX_INGREDIENTS)
    .map((line) => {
      const { ingredientName, quantity, unit, notes } = parseIngredient(line);
      return { ingredientName, quantity, unit, notes };
    });

  return {
    name,
    instructions,
    prepTimeMinutes: durationMinutes(node["prepTime"]),
    cookTimeMinutes: durationMinutes(node["cookTime"]),
    servings: parseServings(node["recipeYield"]),
    sourceUrl,
    notes,
    ingredients,
  };
}

/* -------------------------------------------------------------------------- */
/* Fetch                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * True for the rejection `AbortSignal.timeout` produces. Node has used both
 * `AbortError` and `TimeoutError` (sometimes only on `error.cause`) across
 * releases, so all three are treated as the timeout case.
 */
function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError" || name === "TimeoutError") return true;
  const cause = (error as { cause?: unknown }).cause;
  return cause !== error && cause !== undefined && isAbortError(cause);
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/**
 * Is this address one a request from our server must never be pointed at?
 *
 * Covers loopback, RFC1918 private space, carrier-grade NAT, and -- the one
 * that actually matters on a cloud host -- 169.254.0.0/16, which is where AWS,
 * GCP and Azure serve instance credentials to anything that asks. Multicast and
 * reserved space are included because there is no legitimate recipe there
 * either.
 */
export function isBlockedAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();

  // IPv4-mapped IPv6 (`::ffff:169.254.169.254`) is the same address wearing a
  // hat, so unwrap it and judge the v4 form.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isBlockedAddress(mapped[1]);

  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true; // unspecified, loopback
    if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10 link-local
    if (ip.startsWith("64:ff9b:")) return true; // NAT64 -> v4 space
    return false;
  }

  const parts = ip.split(".");
  if (parts.length !== 4) return true; // not an address we understand: refuse
  const [a, b] = parts.map((part) => Number(part));
  if (!Number.isInteger(a) || !Number.isInteger(b)) return true;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local: CLOUD METADATA
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved

  return false;
}

/**
 * Vet one URL before we are willing to send a request to it.
 *
 * WHY THIS EXISTS. `fetchHtml` makes an outbound request to an address the
 * user chose, from inside the network the server sits in. Without a check that
 * is a server-side request forgery primitive: `http://169.254.169.254/...`
 * reads cloud instance credentials, `http://127.0.0.1:5432` and friends reach
 * every service bound to loopback, and because the scraped text is handed back
 * to the caller as a recipe draft, whatever comes back is *readable* rather
 * than merely triggerable.
 *
 * KNOWN LIMIT, stated rather than papered over: between this lookup and the
 * connection the OS makes, a hostile DNS server can change its answer (a
 * rebinding attack). Closing that needs the connection pinned to the address
 * validated here, which means reaching past `fetch` into the agent's socket
 * factory. What is here stops every static payload and every redirect hop;
 * rebinding remains open, and is the reason the allowlist is deny-by-default
 * on anything that does not parse.
 */
async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That does not look like a URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    // Notably this rejects `data:` (which undici will happily "fetch", letting
    // a caller feed the parser arbitrary bytes) and `file:`.
    throw new Error("Only http and https addresses can be imported.");
  }

  if (url.username || url.password) {
    throw new Error("Remove the credentials from that URL and try again.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // A literal address needs no resolution -- and must not get a free pass by
  // skipping the lookup below.
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new Error("That address is not reachable for import.");
    }
    return url;
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not find that site.");
  }

  // EVERY answer must be public: a name that resolves to both a public and a
  // private address is still a way into the private one.
  if (resolved.length === 0 || resolved.some((entry) => isBlockedAddress(entry.address))) {
    throw new Error("That address is not reachable for import.");
  }

  return url;
}

/**
 * Read a response body with a hard ceiling on how much we will hold.
 *
 * `response.text()` buffers whatever arrives. Against a server that streams
 * without end -- or simply serves a large file, or a gzip bomb, which undici
 * transparently inflates -- that is unbounded memory for the cost of one
 * request. The timeout does bound the *duration*, but a body can move a lot of
 * bytes in ten seconds; measured, an endless stream reached +1.7 GB RSS before
 * the abort fired.
 *
 * So take the stream and stop at the budget. A response with no `body` (an
 * already-buffered one, as in the unit tests) falls back to `text()` and is
 * capped after the fact -- correct, just not incremental.
 */
async function readCappedText(response: Response): Promise<string> {
  const declared = Number(response.headers?.get?.("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
    throw new Error("That page is too large to import.");
  }

  const body = response.body;
  if (!body) {
    const text = await response.text();
    return text.length > MAX_HTML_CHARS ? text.slice(0, MAX_HTML_CHARS) : text;
  }

  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let received = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > MAX_HTML_BYTES) {
        // Everything past the ceiling is discarded rather than refused: a
        // recipe's structured data lives near the top of the document, so a
        // truncated read usually still parses.
        text += decoder.decode(value, { stream: true });
        break;
      }

      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  text += decoder.decode();
  return text.length > MAX_HTML_CHARS ? text.slice(0, MAX_HTML_CHARS) : text;
}

async function fetchHtml(url: string): Promise<string> {
  let current = await assertFetchableUrl(url);
  let response: Response;

  // Redirects are followed BY HAND so every hop is vetted. With
  // `redirect: "follow"` the check above guards only the first URL, and a
  // public page answering 302 to http://169.254.169.254/ walks straight past
  // it -- which is the standard way naive SSRF filters are defeated.
  for (let hop = 0; ; hop++) {
    try {
      response = await fetch(current.href, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      // Propagate the abort untouched so callers can branch on `error.name`.
      if (isAbortError(error)) throw error;
      throw new Error(`Could not reach that page: ${describe(error)}`);
    }

    const location =
      response.status >= 300 && response.status < 400
        ? response.headers?.get?.("location")
        : null;

    if (!location) break;

    if (hop >= MAX_REDIRECTS) {
      throw new Error("That page redirected too many times.");
    }

    current = await assertFetchableUrl(new URL(location, current).href);
  }

  if (!response.ok) {
    throw new Error(
      `That page returned ${response.status}${
        response.statusText ? ` ${response.statusText}` : ""
      }.`,
    );
  }

  // A present-but-wrong content type is a refusal; an absent one is not, since
  // plenty of real sites omit it and the parser tolerates junk anyway.
  const contentType = response.headers?.get?.("content-type");
  if (contentType && !/^\s*(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
    throw new Error("That page is not HTML.");
  }

  try {
    return await readCappedText(response);
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof Error && error.message.startsWith("That page is too large")) {
      throw error;
    }
    throw new Error(`Could not read that page: ${describe(error)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fetch `url` and extract a recipe draft from its structured data.
 *
 * @throws If the page is unreachable, returns a non-200 status, or contains no
 *   recognizable recipe (`"Could not find recipe data on this page."`).
 *   A timeout rejects with the original `AbortError`, untouched.
 *
 * @example
 * const draft = await scrapeRecipe("https://example.com/banana-bread");
 * draft.name;                  // "Banana Bread"
 * draft.prepTimeMinutes;       // 15
 * draft.ingredients[0];        // { ingredientName: "ripe bananas", quantity: 3, unit: null, notes: "mashed" }
 */
export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const html = await fetchHtml(url);

  const node = extractJsonLdRecipe(html) ?? extractMicrodataRecipe(html);
  if (node === null) {
    throw new Error(NO_RECIPE_FOUND);
  }

  return toScrapedRecipe(node, url);
}
