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

// Unicode fraction mappings
const UNICODE_FRACTIONS: Record<string, number> = {
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

/**
 * Parse a quantity from the beginning of a string
 * Returns the parsed quantity and the remaining string
 */
function parseQuantity(input: string): { quantity: number | null; remaining: string } {
  const trimmed = input.trim();

  // Check for Unicode fractions first
  for (const [fraction, value] of Object.entries(UNICODE_FRACTIONS)) {
    if (trimmed.startsWith(fraction)) {
      return { quantity: value, remaining: trimmed.slice(fraction.length).trim() };
    }
  }

  // Pattern for mixed numbers (e.g., "1 1/2"), regular numbers, and fractions
  // This captures: mixed number, fraction, range, decimal, or whole number (in that order)
  const quantityPattern = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+-\d+|\d+\.\d+|\d+)/;
  const match = trimmed.match(quantityPattern);

  if (!match) {
    return { quantity: null, remaining: trimmed };
  }

  const quantityStr = match[0];
  let quantity: number;

  // Handle ranges (e.g., "10-12") - take the first number
  if (quantityStr.includes('-') && /^\d+-\d+$/.test(quantityStr)) {
    const parts = quantityStr.split('-');
    quantity = parseFloat(parts[0]);
  }
  // Handle mixed numbers (e.g., "1 1/2")
  else if (quantityStr.includes(' ') && quantityStr.includes('/')) {
    const parts = quantityStr.split(' ');
    const whole = parseFloat(parts[0]);
    const fractionParts = parts[1].split('/');
    const numerator = parseFloat(fractionParts[0]);
    const denominator = parseFloat(fractionParts[1]);
    quantity = whole + (numerator / denominator);
  }
  // Handle simple fractions (e.g., "1/2")
  else if (quantityStr.includes('/')) {
    const parts = quantityStr.split('/');
    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);
    quantity = numerator / denominator;
  }
  // Handle regular numbers and decimals
  else {
    quantity = parseFloat(quantityStr);
  }

  return {
    quantity: isNaN(quantity) ? null : quantity,
    remaining: trimmed.slice(match.index! + quantityStr.length).trim()
  };
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
      const remaining = words.slice(i + 1).join(' ').trim();
      return { unit: canonical, remaining };
    }
  }

  // Special case: if the first word is "a" or "an", skip it and try again
  if (words.length > 1 && (words[0].toLowerCase() === 'a' || words[0].toLowerCase() === 'an')) {
    const canonical = canonicalizeUnit(words[1]);
    if (canonical) {
      const remaining = words.slice(2).join(' ').trim();
      return { unit: canonical, remaining };
    }
  }

  return { unit: null, remaining: input };
}

/**
 * Parse an ingredient string into structured data
 */
export function parseIngredient(raw: string): {
  quantity: number | null;
  unit: string | null;
  ingredientName: string;
} {
  // Start with the raw string
  let remaining = raw.trim();

  // Parse quantity
  const { quantity, remaining: afterQuantity } = parseQuantity(remaining);
  remaining = afterQuantity;

  // Extract unit
  const { unit, remaining: afterUnit } = extractUnit(remaining);
  remaining = afterUnit;

  // What's left is the ingredient name
  const ingredientName = remaining.trim() || raw.trim();

  return {
    quantity,
    unit,
    ingredientName
  };
}
