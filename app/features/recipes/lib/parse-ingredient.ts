/**
 * Parse ingredient strings into structured data
 */

// Build static lookup maps for unit matching
const UNIT_MAPPINGS: Record<string, string> = {
  // Volume - cups
  'cup': 'cup',
  'cups': 'cup',
  'c': 'cup',

  // Volume - tablespoons
  'tablespoon': 'tablespoon',
  'tablespoons': 'tablespoon',
  'tbsp': 'tablespoon',
  'tbsps': 'tablespoon',
  'tbs': 'tablespoon',
  't': 'tablespoon',

  // Volume - teaspoons
  'teaspoon': 'teaspoon',
  'teaspoons': 'teaspoon',
  'tsp': 'teaspoon',
  'tsps': 'teaspoon',

  // Volume - fluid ounces
  'fluid ounce': 'fluid ounce',
  'fluid ounces': 'fluid ounce',
  'fl oz': 'fluid ounce',
  'fl. oz': 'fluid ounce',
  'fl. oz.': 'fluid ounce',

  // Volume - milliliters
  'milliliter': 'milliliter',
  'milliliters': 'milliliter',
  'ml': 'milliliter',
  'mls': 'milliliter',

  // Volume - liters
  'liter': 'liter',
  'liters': 'liter',
  'litre': 'liter',
  'litres': 'liter',
  'l': 'liter',

  // Volume - pints
  'pint': 'pint',
  'pints': 'pint',
  'pt': 'pint',
  'pts': 'pint',

  // Volume - quarts
  'quart': 'quart',
  'quarts': 'quart',
  'qt': 'quart',
  'qts': 'quart',

  // Volume - gallons
  'gallon': 'gallon',
  'gallons': 'gallon',
  'gal': 'gallon',
  'gals': 'gallon',

  // Weight - ounces
  'ounce': 'ounce',
  'ounces': 'ounce',
  'oz': 'ounce',
  'ozs': 'ounce',
  'oz.': 'ounce',

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
  'g': 'gram',
  'gs': 'gram',
  'gr': 'gram',

  // Weight - kilograms
  'kilogram': 'kilogram',
  'kilograms': 'kilogram',
  'kg': 'kilogram',
  'kgs': 'kilogram',
  'kilo': 'kilogram',
  'kilos': 'kilogram',

  // Count - pieces
  'piece': 'piece',
  'pieces': 'piece',
  'pc': 'piece',
  'pcs': 'piece',

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

  // Container - package
  'package': 'package',
  'packages': 'package',
  'pkg': 'package',
  'pkgs': 'package',

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
    const possibleUnit = words.slice(0, i + 1).join(' ').toLowerCase();

    if (UNIT_MAPPINGS[possibleUnit]) {
      const remaining = words.slice(i + 1).join(' ').trim();
      return { unit: UNIT_MAPPINGS[possibleUnit], remaining };
    }
  }

  // Special case: if the first word is "a" or "an", skip it and try again
  if (words.length > 1 && (words[0].toLowerCase() === 'a' || words[0].toLowerCase() === 'an')) {
    const possibleUnit = words[1].toLowerCase();
    if (UNIT_MAPPINGS[possibleUnit]) {
      const remaining = words.slice(2).join(' ').trim();
      return { unit: UNIT_MAPPINGS[possibleUnit], remaining };
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

/*
// Test cases
console.log(parseIngredient("2 cups all-purpose flour"));
// { quantity: 2, unit: 'cup', ingredientName: 'all-purpose flour' }

console.log(parseIngredient("1/2 teaspoon salt"));
// { quantity: 0.5, unit: 'teaspoon', ingredientName: 'salt' }

console.log(parseIngredient("1 1/2 lbs chicken breast"));
// { quantity: 1.5, unit: 'pound', ingredientName: 'chicken breast' }

console.log(parseIngredient("Salt to taste"));
// { quantity: null, unit: null, ingredientName: 'Salt to taste' }

console.log(parseIngredient("3 large eggs"));
// { quantity: 3, unit: null, ingredientName: 'large eggs' }

console.log(parseIngredient("½ cup milk"));
// { quantity: 0.5, unit: 'cup', ingredientName: 'milk' }

console.log(parseIngredient("2.5 kg potatoes"));
// { quantity: 2.5, unit: 'kilogram', ingredientName: 'potatoes' }

console.log(parseIngredient("1 can tomatoes"));
// { quantity: 1, unit: 'can', ingredientName: 'tomatoes' }

console.log(parseIngredient("a pinch of sugar"));
// { quantity: null, unit: 'pinch', ingredientName: 'of sugar' }

console.log(parseIngredient("16 fl oz beer"));
// { quantity: 16, unit: 'fluid ounce', ingredientName: 'beer' }

console.log(parseIngredient("2 tablespoons olive oil"));
// { quantity: 2, unit: 'tablespoon', ingredientName: 'olive oil' }

console.log(parseIngredient("1 stick butter"));
// { quantity: 1, unit: 'stick', ingredientName: 'butter' }

console.log(parseIngredient("Fresh basil leaves"));
// { quantity: null, unit: null, ingredientName: 'Fresh basil leaves' }

console.log(parseIngredient("¾ tsp vanilla extract"));
// { quantity: 0.75, unit: 'teaspoon', ingredientName: 'vanilla extract' }

console.log(parseIngredient("10-12 cherry tomatoes"));
// { quantity: 10, unit: null, ingredientName: 'cherry tomatoes' }

console.log(parseIngredient(""));
// { quantity: null, unit: null, ingredientName: '' }

console.log(parseIngredient("   "));
// { quantity: null, unit: null, ingredientName: '' }
*/