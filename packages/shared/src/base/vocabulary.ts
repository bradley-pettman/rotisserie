export function canonicalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

const UNIT_SPELLINGS: Record<string, string[]> = {
  cup: ['cups', 'c', 'c.'],
  tablespoon: ['tablespoons', 'tbsp', 'tbsp.', 'tbsps', 'tbsps.', 'tbs', 'tbs.'],
  teaspoon: ['teaspoons', 'tsp', 'tsp.', 'tsps', 'tsps.'],
  'fluid ounce': ['fluid ounces', 'fluid oz', 'fluid oz.', 'fl oz', 'fl oz.', 'fl. oz', 'fl. oz.', 'floz', 'floz.'],
  milliliter: ['milliliters', 'ml', 'ml.', 'mls', 'mls.'],
  liter: ['liters', 'litre', 'litres', 'l', 'l.'],
  pint: ['pints', 'pt', 'pt.', 'pts', 'pts.'],
  quart: ['quarts', 'qt', 'qt.', 'qts', 'qts.'],
  gallon: ['gallons', 'gal', 'gal.', 'gals', 'gals.'],
  ounce: ['ounces', 'oz', 'oz.', 'ozs', 'ozs.'],
  pound: ['pounds', 'lb', 'lb.', 'lbs', 'lbs.'],
  gram: ['grams', 'gramme', 'grammes', 'g', 'g.', 'gs', 'gs.', 'gr', 'gr.'],
  kilogram: ['kilograms', 'kg', 'kg.', 'kgs', 'kgs.', 'kilo', 'kilos'],
  piece: ['pieces', 'pc', 'pc.', 'pcs', 'pcs.'],
  whole: ['wholes'],
  slice: ['slices'],
  clove: ['cloves'],
  bunch: ['bunches'],
  pinch: ['pinches'],
  dash: ['dashes'],
  handful: ['handfuls'],
  sprig: ['sprigs'],
  head: ['heads'],
  stalk: ['stalks'],
  leaf: ['leaves'],
  can: ['cans', 'tin', 'tins'],
  package: ['packages', 'packet', 'packets', 'pkg', 'pkg.', 'pkgs', 'pkgs.', 'pkt', 'pkt.'],
  jar: ['jars'],
  bottle: ['bottles'],
  bag: ['bags'],
  box: ['boxes'],
  stick: ['sticks'],
  cube: ['cubes']
}

export function canonicalizeUnit(unit: string): string {
  const name = canonicalizeName(unit)
  const match = Object.entries(UNIT_SPELLINGS).find(
    ([canonical, spellings]) => canonical === name || spellings.includes(name)
  )
  return match?.[0] ?? name
}
