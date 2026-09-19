/**
 * Parse ingredient strings into structured data
 */

/**
 * Static lookup of every spelling we accept for a unit (plurals, abbreviations,
 * punctuated forms) onto its canonical singular name. The canonical names are
 * exactly the names seeded into the `units` table, so anything this table maps
 * resolves to a pre-existing row rather than creating a near-duplicate.
 *
 * Convention: every abbreviated spelling also gets a trailing-period form
 * ("tbsp" and "tbsp."), since recipe text punctuates abbreviations freely and
 * an unmapped spelling would otherwise land in `units` as an `unreviewed` row.
 */
export const UNIT_MAPPINGS: Record<string, string> = {
  // Volume - cups
  'cup': 'cup',
  'cups': 'cup',
  'c': 'cup',
  'c.': 'cup',

  // Volume - tablespoons
  // NOTE: no 't' key. Traditional recipe convention is T = tablespoon and
  // t = teaspoon, but lookups here are deliberately case-insensitive (scraped
  // text capitalizes arbitrarily), so a single 't' cannot be disambiguated.
  // Leaving it unresolved (-> `unreviewed`, visibly wrong) is far safer than
  // silently tripling a teaspoon into a tablespoon in the database.
  'tablespoon': 'tablespoon',
  'tablespoons': 'tablespoon',
  'tbsp': 'tablespoon',
  'tbsp.': 'tablespoon',
  'tbsps': 'tablespoon',
  'tbsps.': 'tablespoon',
  'tbs': 'tablespoon',
  'tbs.': 'tablespoon',

  // Volume - teaspoons
  'teaspoon': 'teaspoon',
  'teaspoons': 'teaspoon',
  'tsp': 'teaspoon',
  'tsp.': 'teaspoon',
  'tsps': 'teaspoon',
  'tsps.': 'teaspoon',

  // Volume - fluid ounces
  'fluid ounce': 'fluid ounce',
  'fluid ounces': 'fluid ounce',
  'fluid oz': 'fluid ounce',
  'fluid oz.': 'fluid ounce',
  'fl oz': 'fluid ounce',
  'fl oz.': 'fluid ounce',
  'fl. oz': 'fluid ounce',
  'fl. oz.': 'fluid ounce',
  'floz': 'fluid ounce',
  'floz.': 'fluid ounce',

  // Volume - milliliters
  'milliliter': 'milliliter',
  'milliliters': 'milliliter',
  'ml': 'milliliter',
  'ml.': 'milliliter',
  'mls': 'milliliter',
  'mls.': 'milliliter',

  // Volume - liters
  'liter': 'liter',
  'liters': 'liter',
  'litre': 'liter',
  'litres': 'liter',
  'l': 'liter',
  'l.': 'liter',

  // Volume - pints
  'pint': 'pint',
  'pints': 'pint',
  'pt': 'pint',
  'pt.': 'pint',
  'pts': 'pint',
  'pts.': 'pint',

  // Volume - quarts
  'quart': 'quart',
  'quarts': 'quart',
  'qt': 'quart',
  'qt.': 'quart',
  'qts': 'quart',
  'qts.': 'quart',

  // Volume - gallons
  'gallon': 'gallon',
  'gallons': 'gallon',
  'gal': 'gallon',
  'gal.': 'gallon',
  'gals': 'gallon',
  'gals.': 'gallon',

  // Weight - ounces
  'ounce': 'ounce',
  'ounces': 'ounce',
  'oz': 'ounce',
  'oz.': 'ounce',
  'ozs': 'ounce',
  'ozs.': 'ounce',

  // Weight - pounds
  'pound': 'pound',
  'pounds': 'pound',
  'lb': 'pound',
  'lbs': 'pound',
  'lb.': 'pound',
  'lbs.': 'pound',

  // Weight - grams
  'gram': 'gram',
  'grams': 'gram',
  'gramme': 'gram',
  'grammes': 'gram',
  'g': 'gram',
  'g.': 'gram',
  'gs': 'gram',
  'gs.': 'gram',
  'gr': 'gram',
  'gr.': 'gram',

  // Weight - kilograms
  'kilogram': 'kilogram',
  'kilograms': 'kilogram',
  'kg': 'kilogram',
  'kg.': 'kilogram',
  'kgs': 'kilogram',
  'kgs.': 'kilogram',
  'kilo': 'kilogram',
  'kilos': 'kilogram',

  // Count - pieces
  'piece': 'piece',
  'pieces': 'piece',
  'pc': 'piece',
  'pc.': 'piece',
  'pcs': 'piece',
  'pcs.': 'piece',

  // Count - whole
  'whole': 'whole',
  'wholes': 'whole',

  // Count - slice
  'slice': 'slice',
  'slices': 'slice',

  // Count - clove
  'clove': 'clove',
  'cloves': 'clove',

  // Count - bunch
  'bunch': 'bunch',
  'bunches': 'bunch',

  // Count - pinch
  'pinch': 'pinch',
  'pinches': 'pinch',

  // Count - dash
  'dash': 'dash',
  'dashes': 'dash',

  // Count - sprig
  'sprig': 'sprig',
  'sprigs': 'sprig',

  // Count - head
  'head': 'head',
  'heads': 'head',

  // Count - stalk
  'stalk': 'stalk',
  'stalks': 'stalk',

  // Count - leaf
  'leaf': 'leaf',
  'leaves': 'leaf',

  // Container - can
  'can': 'can',
  'cans': 'can',
  'tin': 'can',
  'tins': 'can',

  // Container - package
  'package': 'package',
  'packages': 'package',
  'packet': 'package',
  'packets': 'package',
  'pkg': 'package',
  'pkg.': 'package',
  'pkgs': 'package',
  'pkgs.': 'package',
  'pkt': 'package',
  'pkt.': 'package',

  // Container - jar
  'jar': 'jar',
  'jars': 'jar',

  // Container - bottle
  'bottle': 'bottle',
  'bottles': 'bottle',

  // Container - bag
  'bag': 'bag',
  'bags': 'bag',

  // Container - box
  'box': 'box',
  'boxes': 'box',

  // Container - stick
  'stick': 'stick',
  'sticks': 'stick',

  // Container - cube
  'cube': 'cube',
  'cubes': 'cube',
};

/**
 * Normalize a free-typed unit spelling onto its canonical name.
 *
 * Lowercases and trims the input, then looks it up in UNIT_MAPPINGS. Returns
 * the canonical singular name (e.g. "Cups" -> "cup", " TBSP " -> "tablespoon")
 * or null when the input is blank or is not a spelling we recognize.
 */
export function canonicalizeUnit(raw: string): string | null {
  if (!raw) return null;

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;

  // Own-property check: a bare index would otherwise resolve inherited
  // Object.prototype members ("constructor", "toString", ...) to non-units.
  if (!Object.prototype.hasOwnProperty.call(UNIT_MAPPINGS, normalized)) {
    return null;
  }

  return UNIT_MAPPINGS[normalized];
}

/**
 * Unicode fraction glyphs and their values.
 *
 * Recipe sites emit these both alone ("½ cup milk") and welded to a whole
 * number ("1½ cups", "1 ½ cups") — the mixed form is standard typography on
 * the major sites, so both are tokenized below.
 */
export const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1/3,
  '⅔': 2/3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1/6,
  '⅚': 5/6,
  '⅛': 0.125,
  '⅜': 3/8,
  '⅝': 5/8,
  '⅞': 7/8,
};

/** Character class source matching any one glyph in UNICODE_FRACTIONS. */
const FRACTION_CLASS = `[${Object.keys(UNICODE_FRACTIONS).join('')}]`;

/* -------------------------------------------------------------------------- */
/* Quantity tokenizing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * "1½" / "1 ½" — a whole number followed by a Unicode fraction. Matched before
 * the bare-number pattern so the glyph is added to the whole rather than left
 * behind, where it would both understate the quantity and block the unit.
 */
const MIXED_UNICODE = new RegExp(`^(\\d+)\\s*(${FRACTION_CLASS})`);

/**
 * "1 1/2" and the hyphenated spelling "1-1/2". The hyphen form has to be tried
 * before the range pattern, or "1-1/2 cups" reads as the range 1 to 1.
 */
const MIXED_ASCII = /^(\d+)[\s-]+(\d+)\/(\d+)/;

/** "1/2" */
const ASCII_FRACTION = /^(\d+)\/(\d+)/;

/** A lone "½". */
const BARE_UNICODE = new RegExp(`^${FRACTION_CLASS}`);

/** "2" or "2.5" */
const PLAIN_NUMBER = /^\d+(?:\.\d+)?/;

/**
 * Separator between the two ends of a range: hyphen, en dash, em dash (a CMS
 * typographic pass rewrites "2-3" as "2–3") or the word "to".
 */
const RANGE_SEPARATOR = /^(?:\s*[-–—]\s*|\s+to\s+)/i;

/**
 * A number glued by a hyphen to a word — "1-inch piece", "8-ounce package" —
 * is a dimension, not a count. Taking the number would leave the name starting
 * with a stray "-inch", so the whole compound is left in the name instead.
 */
const HYPHENATED_COMPOUND = /^[-–—][a-zA-Z]/;

type QuantityToken = { value: number; length: number };

/** The quantity token at the start of `input`, if there is one. */
function matchQuantityToken(input: string): QuantityToken | null {
  const mixedUnicode = input.match(MIXED_UNICODE);
  if (mixedUnicode) {
    return {
      value: parseInt(mixedUnicode[1], 10) + UNICODE_FRACTIONS[mixedUnicode[2]],
      length: mixedUnicode[0].length,
    };
  }

  // A zero denominator falls through to the plainer patterns rather than
  // returning Infinity as a quantity.
  const mixedAscii = input.match(MIXED_ASCII);
  if (mixedAscii) {
    const whole = parseInt(mixedAscii[1], 10);
    const numerator = parseInt(mixedAscii[2], 10);
    const denominator = parseInt(mixedAscii[3], 10);
    if (denominator !== 0) {
      return { value: whole + numerator / denominator, length: mixedAscii[0].length };
    }
  }

  const fraction = input.match(ASCII_FRACTION);
  if (fraction) {
    const numerator = parseInt(fraction[1], 10);
    const denominator = parseInt(fraction[2], 10);
    if (denominator !== 0) {
      return { value: numerator / denominator, length: fraction[0].length };
    }
  }

  const bareUnicode = input.match(BARE_UNICODE);
  if (bareUnicode) {
    return { value: UNICODE_FRACTIONS[bareUnicode[0]], length: bareUnicode[0].length };
  }

  const plain = input.match(PLAIN_NUMBER);
  if (plain) {
    const value = parseFloat(plain[0]);
    if (!isNaN(value)) return { value, length: plain[0].length };
  }

  return null;
}

/**
 * Parse a quantity from the beginning of a string.
 *
 * Handles whole numbers, decimals, ASCII and Unicode fractions, both mixed
 * forms ("1 1/2", "1½", "1 ½") and ranges. A range keeps its low end, which is
 * the long-standing convention here: "2-3 tablespoons" is 2 tablespoons.
 *
 * Returns the parsed quantity and the remaining string.
 */
function parseQuantity(input: string): { quantity: number | null; remaining: string } {
  const trimmed = input.trim();

  const first = matchQuantityToken(trimmed);
  if (!first) {
    return { quantity: null, remaining: trimmed };
  }

  const afterFirst = trimmed.slice(first.length);

  // "1-inch", "8-ounce": a dimension, so nothing here is a quantity.
  if (HYPHENATED_COMPOUND.test(afterFirst)) {
    return { quantity: null, remaining: trimmed };
  }

  let consumed = first.length;

  // Ranges: consume the separator and the high end, keep the low end.
  const separator = afterFirst.match(RANGE_SEPARATOR);
  if (separator) {
    const second = matchQuantityToken(afterFirst.slice(separator[0].length));
    if (second) {
      consumed += separator[0].length + second.length;
    }
  }

  return {
    quantity: isNaN(first.value) ? null : first.value,
    remaining: trimmed.slice(consumed).trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* Unit extraction                                                             */
/* -------------------------------------------------------------------------- */

/**
 * "pinch of salt", "1 can of tomatoes": the preposition belongs to the unit
 * phrase, not to the ingredient name.
 */
function stripLeadingOf(text: string): string {
  return text.replace(/^of\b\s*/i, '').trim();
}

/**
 * Extract unit from string, checking against known units
 */
function extractUnit(input: string): { unit: string | null; remaining: string } {
  const words = input.split(/\s+/);

  // Try matching 1-2 word units (e.g., "fluid ounce")
  for (let i = 0; i < Math.min(2, words.length); i++) {
    const canonical = canonicalizeUnit(words.slice(0, i + 1).join(' '));

    if (canonical) {
      const remaining = stripLeadingOf(words.slice(i + 1).join(' ').trim());
      return { unit: canonical, remaining };
    }
  }

  // Special case: if the first word is "a" or "an", skip it and try again
  if (words.length > 1 && (words[0].toLowerCase() === 'a' || words[0].toLowerCase() === 'an')) {
    const canonical = canonicalizeUnit(words[1]);
    if (canonical) {
      const remaining = stripLeadingOf(words.slice(2).join(' ').trim());
      return { unit: canonical, remaining };
    }
  }

  return { unit: null, remaining: input };
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pull every balanced parenthetical out of the line, returning the remaining
 * text and the contents in the order they appeared.
 *
 * Two jobs: a package size sitting between the quantity and the unit ("1 (14.5
 * ounce) can diced tomatoes") otherwise blocks unit extraction outright, and
 * the content itself is a note rather than part of the ingredient's name.
 * Unbalanced parentheses are left verbatim — better untouched than mangled.
 */
function extractParentheticals(input: string): { text: string; notes: string[] } {
  const notes: string[] = [];

  const text = input
    .replace(/\(([^()]*)\)/g, (_whole, body: string) => {
      const note = body.trim();
      if (note) notes.push(note);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  return { text, notes };
}

/**
 * First words that mark a trailing clause as a note: "plus more for dusting",
 * "to taste", "for garnish", "at room temperature", "cut into 1-inch pieces".
 */
const NOTE_LEAD_WORDS = new Set([
  'about',
  'approximately',
  'as',
  'at',
  'beaten',
  'broken',
  'cut',
  'for',
  'ideally',
  'if',
  'more',
  'optional',
  'or',
  'plus',
  'room',
  'such',
  'to',
  'torn',
  'well',
]);

/**
 * Single-word clauses that describe the product bought rather than something
 * done to it. "butter, unsalted" is a name, "butter, softened" is a note — and
 * splitting the first would quietly rewrite the canonical ingredient.
 */
const NAME_QUALIFIERS = new Set([
  'aged',
  'bleached',
  'canned',
  'condensed',
  'dried',
  'evaporated',
  'granulated',
  'mixed',
  'powdered',
  'salted',
  'smoked',
  'sweetened',
  'unbleached',
  'uncooked',
  'unsalted',
  'unsweetened',
]);

/**
 * A word ending in "-ed" or "-ly" of at least four letters: "chopped",
 * "removed", "thinly", "freshly". Three-letter words are excluded so that the
 * colour in "1 bell pepper, red" is not mistaken for a preparation.
 */
const PARTICIPLE = /^[a-zà-ÿ][a-zà-ÿ-]+(?:ed|ly)$/;

/** Strip surrounding punctuation from a word before testing it. */
function bareWord(word: string): string {
  return word.toLowerCase().replace(/^[^a-zà-ÿ]+|[^a-zà-ÿ]+$/g, '');
}

/**
 * Whether a comma clause reads as a preparation note rather than part of the
 * ingredient's name. Deliberately cautious: an unrecognized clause stays in the
 * name, because a wrong split corrupts the canonical name that the shared
 * `ingredients` table is keyed on, while a missed split merely keeps today's
 * behaviour.
 */
function isNoteClause(clause: string): boolean {
  const words = clause.trim().split(/\s+/).map(bareWord).filter(Boolean);
  if (words.length === 0) return false;

  if (words.length === 1 && NAME_QUALIFIERS.has(words[0])) return false;
  if (NOTE_LEAD_WORDS.has(words[0])) return true;

  return words.some((word) => PARTICIPLE.test(word));
}

/**
 * Split trailing preparation notes off an ingredient name.
 *
 * "flour, sifted" -> name "flour", notes "sifted". Everything from the first
 * note-like clause onwards becomes the note, so "carrots, peeled, cut into
 * coins" keeps both halves of the preparation together. The name is never left
 * empty, and a line whose clauses are all unrecognized is returned untouched.
 */
function splitNotes(name: string): { name: string; note: string | null } {
  const clauses = name.split(',');
  if (clauses.length < 2) return { name: name.trim(), note: null };

  for (let i = 1; i < clauses.length; i++) {
    if (!isNoteClause(clauses[i])) continue;

    const head = clauses.slice(0, i).join(',').trim();
    const tail = clauses.slice(i).join(',').trim();
    if (!head || !tail) break;

    return { name: head, note: tail };
  }

  return { name: name.trim(), note: null };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export type ParsedIngredient = {
  quantity: number | null;
  unit: string | null;
  ingredientName: string;
  /**
   * Preparation notes split off the name: parenthetical content and/or a
   * trailing comma clause. Null when the line carries neither.
   */
  notes: string | null;
};

/**
 * Parse an ingredient string into structured data.
 *
 * @example
 * parseIngredient("1½ cups granulated sugar");
 * // { quantity: 1.5, unit: "cup", ingredientName: "granulated sugar", notes: null }
 * parseIngredient("1 (14.5 ounce) can diced tomatoes");
 * // { quantity: 1, unit: "can", ingredientName: "diced tomatoes", notes: "14.5 ounce" }
 * parseIngredient("2 cups flour, sifted");
 * // { quantity: 2, unit: "cup", ingredientName: "flour", notes: "sifted" }
 */
export function parseIngredient(raw: string): ParsedIngredient {
  const trimmed = raw.trim();

  // Parentheticals come out first: one sitting between the quantity and the
  // unit would otherwise stop the unit from ever being matched.
  const { text, notes: parentheticalNotes } = extractParentheticals(trimmed);

  const { quantity, remaining: afterQuantity } = parseQuantity(text);
  const { unit, remaining: afterUnit } = extractUnit(afterQuantity);

  // What's left is the ingredient name, minus any trailing preparation note.
  const { name, note } = splitNotes(afterUnit);

  const noteParts = note === null ? parentheticalNotes : [...parentheticalNotes, note];

  return {
    quantity,
    unit,
    ingredientName: name || text || trimmed,
    notes: noteParts.length > 0 ? noteParts.join(', ') : null,
  };
}
