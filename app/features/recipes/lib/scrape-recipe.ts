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
export function stripHtml(html: string): string {
  if (!html) return "";

  let text = String(html);

  // Script/style bodies are code, not prose — drop them wholesale.
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(new RegExp(`<\\s*(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  text = text.replace(new RegExp(`<\\s*/\\s*(?:${BLOCK_TAGS})\\s*>`, "gi"), "\n");
  text = text.replace(/<[^>]*>/g, "");

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
const JSON_LD_BLOCK =
  /<script\b[^>]*\stype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

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
  JSON_LD_BLOCK.lastIndex = 0;

  let block: RegExpExecArray | null;
  while ((block = JSON_LD_BLOCK.exec(html)) !== null) {
    const body = unwrapScriptBody(block[1] ?? "");
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

/**
 * Index just past the element opened at `contentStart`, by counting nested
 * open/close tags of the same name.
 */
function findElementEnd(html: string, tag: string, contentStart: number): number {
  if (!/^[a-z][a-z0-9-]*$/i.test(tag)) return html.length;

  const scanner = new RegExp(`<\\s*(/?)${tag}\\b[^>]*>`, "gi");
  scanner.lastIndex = contentStart;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(html)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) return match.index;
    } else if (!/\/\s*>$/.test(match[0])) {
      depth += 1;
    }
  }

  return html.length;
}

type MicrodataElement = { tag: string; attrs: string; inner: string };

/** The recipe subtree: from the `itemtype="…/Recipe"` element to its close tag. */
function extractRecipeScope(html: string): string | null {
  const match = html.match(
    /<([a-z][a-z0-9-]*)\b([^>]*\bitemtype\s*=\s*["'][^"']*schema\.org\/Recipe[^"']*["'][^>]*)>/i,
  );
  if (!match || match.index === undefined) return null;

  const tag = match[1].toLowerCase();
  const contentStart = match.index + match[0].length;
  if (VOID_TAGS.has(tag)) return null;

  return html.slice(contentStart, findElementEnd(html, tag, contentStart));
}

/**
 * Byte ranges of nested `itemscope` elements inside the recipe scope. An
 * `itemprop` inside one of these belongs to a sub-item (author, nutrition,
 * aggregateRating) and must not be read as a recipe property — otherwise the
 * author's `itemprop="name"` is mistaken for the recipe title.
 */
function nestedScopeRanges(scope: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const opener = /<([a-z][a-z0-9-]*)\b([^>]*\bitemscope\b[^>]*)>/gi;

  let match: RegExpExecArray | null;
  while ((match = opener.exec(scope)) !== null) {
    const tag = match[1].toLowerCase();
    if (VOID_TAGS.has(tag)) continue;
    const contentStart = match.index + match[0].length;
    ranges.push([match.index, findElementEnd(scope, tag, contentStart)]);
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
  const finder = new RegExp(
    `<([a-z][a-z0-9-]*)\\b([^>]*\\bitemprop\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["'][^>]*)>`,
    "gi",
  );

  const found: MicrodataElement[] = [];
  let match: RegExpExecArray | null;
  while ((match = finder.exec(scope)) !== null) {
    if (withinAny(match.index, nested)) continue;

    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const contentStart = match.index + match[0].length;
    const inner = VOID_TAGS.has(tag)
      ? ""
      : scope.slice(contentStart, findElementEnd(scope, tag, contentStart));

    found.push({ tag, attrs, inner });
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

  const steps = collectInstructionSteps(node["recipeInstructions"]);
  const instructions = steps.length > 0 ? steps.join("\n\n") : null;

  // `ingredients` is the pre-2017 schema.org spelling; some sites still emit it.
  const rawIngredients = node["recipeIngredient"] ?? node["ingredients"];
  const ingredients = toStringArray(rawIngredients)
    .map(stripHtmlInline)
    .filter((line) => line !== "")
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

async function fetchHtml(url: string): Promise<string> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    // Propagate the abort untouched so callers can branch on `error.name`.
    if (isAbortError(error)) throw error;
    throw new Error(`Could not reach that page: ${describe(error)}`);
  }

  if (!response.ok) {
    throw new Error(
      `That page returned ${response.status}${
        response.statusText ? ` ${response.statusText}` : ""
      }.`,
    );
  }

  try {
    return await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
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
