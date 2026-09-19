import { describe, expect, it } from "vitest";

import {
  canonicalizeUnit,
  parseIngredient,
  UNICODE_FRACTIONS,
  UNIT_MAPPINGS,
} from "~/features/recipes/lib/parse-ingredient";

/**
 * Every assertion in the "specified behaviour" block below is a direct
 * transcription of one of the `console.log(parseIngredient(...))` cases that
 * used to sit, commented out, at the bottom of parse-ingredient.ts, together
 * with the expected output written next to it. That block was the spec; it has
 * been deleted from the source file and lives here instead.
 */
describe("parseIngredient", () => {
  describe("specified behaviour", () => {
    it('parses "2 cups all-purpose flour"', () => {
      const result = parseIngredient("2 cups all-purpose flour");
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe("cup");
      expect(result.ingredientName).toBe("all-purpose flour");
    });

    it('parses "1/2 teaspoon salt"', () => {
      const result = parseIngredient("1/2 teaspoon salt");
      expect(result.quantity).toBeCloseTo(0.5);
      expect(result.unit).toBe("teaspoon");
      expect(result.ingredientName).toBe("salt");
    });

    it('parses "1 1/2 lbs chicken breast"', () => {
      const result = parseIngredient("1 1/2 lbs chicken breast");
      expect(result.quantity).toBeCloseTo(1.5);
      expect(result.unit).toBe("pound");
      expect(result.ingredientName).toBe("chicken breast");
    });

    it('parses "Salt to taste"', () => {
      const result = parseIngredient("Salt to taste");
      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.ingredientName).toBe("Salt to taste");
    });

    it('parses "3 large eggs"', () => {
      const result = parseIngredient("3 large eggs");
      expect(result.quantity).toBe(3);
      expect(result.unit).toBeNull();
      expect(result.ingredientName).toBe("large eggs");
    });

    it('parses "½ cup milk"', () => {
      const result = parseIngredient("½ cup milk");
      expect(result.quantity).toBeCloseTo(0.5);
      expect(result.unit).toBe("cup");
      expect(result.ingredientName).toBe("milk");
    });

    it('parses "2.5 kg potatoes"', () => {
      const result = parseIngredient("2.5 kg potatoes");
      expect(result.quantity).toBeCloseTo(2.5);
      expect(result.unit).toBe("kilogram");
      expect(result.ingredientName).toBe("potatoes");
    });

    it('parses "1 can tomatoes"', () => {
      const result = parseIngredient("1 can tomatoes");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("can");
      expect(result.ingredientName).toBe("tomatoes");
    });

    /**
     * The transcribed expectation here was `ingredientName: "of sugar"`. The
     * preposition belongs to the unit phrase, not to the ingredient, and
     * leaving it on the front produced "of sugar" as a canonical ingredient
     * name. See the "leading prepositions" block below.
     */
    it('parses "a pinch of sugar"', () => {
      const result = parseIngredient("a pinch of sugar");
      expect(result.quantity).toBeNull();
      expect(result.unit).toBe("pinch");
      expect(result.ingredientName).toBe("sugar");
    });

    it('parses "16 fl oz beer"', () => {
      const result = parseIngredient("16 fl oz beer");
      expect(result.quantity).toBe(16);
      expect(result.unit).toBe("fluid ounce");
      expect(result.ingredientName).toBe("beer");
    });

    it('parses "2 tablespoons olive oil"', () => {
      const result = parseIngredient("2 tablespoons olive oil");
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe("tablespoon");
      expect(result.ingredientName).toBe("olive oil");
    });

    it('parses "1 stick butter"', () => {
      const result = parseIngredient("1 stick butter");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("stick");
      expect(result.ingredientName).toBe("butter");
    });

    it('parses "Fresh basil leaves"', () => {
      const result = parseIngredient("Fresh basil leaves");
      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.ingredientName).toBe("Fresh basil leaves");
    });

    it('parses "¾ tsp vanilla extract"', () => {
      const result = parseIngredient("¾ tsp vanilla extract");
      expect(result.quantity).toBeCloseTo(0.75);
      expect(result.unit).toBe("teaspoon");
      expect(result.ingredientName).toBe("vanilla extract");
    });

    it('parses "10-12 cherry tomatoes" by taking the low end of the range', () => {
      const result = parseIngredient("10-12 cherry tomatoes");
      expect(result.quantity).toBe(10);
      expect(result.unit).toBeNull();
      expect(result.ingredientName).toBe("cherry tomatoes");
    });

    it("parses an empty string", () => {
      const result = parseIngredient("");
      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.ingredientName).toBe("");
    });

    it("parses a whitespace-only string", () => {
      const result = parseIngredient("   ");
      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.ingredientName).toBe("");
    });
  });

  describe("fractional quantities", () => {
    it('parses the unicode fraction "⅓ cup water"', () => {
      const result = parseIngredient("⅓ cup water");
      expect(result.quantity).toBeCloseTo(1 / 3);
      expect(result.unit).toBe("cup");
      expect(result.ingredientName).toBe("water");
    });

    it('parses the unicode fraction "⅔ cup sugar"', () => {
      const result = parseIngredient("⅔ cup sugar");
      expect(result.quantity).toBeCloseTo(2 / 3);
      expect(result.unit).toBe("cup");
      expect(result.ingredientName).toBe("sugar");
    });

    it('parses the ascii fraction "1/3 cup rice"', () => {
      const result = parseIngredient("1/3 cup rice");
      expect(result.quantity).toBeCloseTo(1 / 3);
      expect(result.unit).toBe("cup");
      expect(result.ingredientName).toBe("rice");
    });

    it('parses the ascii fraction "2/3 cup oats"', () => {
      const result = parseIngredient("2/3 cup oats");
      expect(result.quantity).toBeCloseTo(2 / 3);
      expect(result.unit).toBe("cup");
      expect(result.ingredientName).toBe("oats");
    });
  });
});

describe("canonicalizeUnit", () => {
  it("normalizes case and plurals", () => {
    expect(canonicalizeUnit("Cups")).toBe("cup");
  });

  it("trims surrounding whitespace and normalizes abbreviations", () => {
    expect(canonicalizeUnit("  TBSP ")).toBe("tablespoon");
  });

  it("handles punctuated abbreviations", () => {
    expect(canonicalizeUnit("lbs.")).toBe("pound");
  });

  it("handles multi-word units", () => {
    expect(canonicalizeUnit("fl oz")).toBe("fluid ounce");
  });

  it("returns null for an unknown unit", () => {
    expect(canonicalizeUnit("glug")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(canonicalizeUnit("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(canonicalizeUnit("   ")).toBeNull();
  });

  it("passes canonical names through unchanged", () => {
    expect(canonicalizeUnit("cup")).toBe("cup");
    expect(canonicalizeUnit("fluid ounce")).toBe("fluid ounce");
  });

  it("does not resolve inherited Object properties to a unit", () => {
    expect(canonicalizeUnit("constructor")).toBeNull();
    expect(canonicalizeUnit("toString")).toBeNull();
  });

  it("maps every spelling onto a canonical name that is itself a key", () => {
    for (const canonical of Object.values(UNIT_MAPPINGS)) {
      expect(canonicalizeUnit(canonical)).toBe(canonical);
    }
  });

  /**
   * Traditional recipe convention is T = tablespoon, t = teaspoon, but this
   * table is case-insensitive by design (scraped text capitalizes arbitrarily),
   * so a lone "t" cannot be told apart from a lone "T". Resolving it to
   * tablespoon silently tripled anyone who meant a teaspoon, and wrote that
   * 3x error to the database. It must now resolve to nothing at all.
   */
  describe("the ambiguous single-letter t", () => {
    it('returns null for "t" rather than guessing tablespoon', () => {
      expect(canonicalizeUnit("t")).toBeNull();
    });

    it('returns null for "T" as well, since lookups are case-folded', () => {
      expect(canonicalizeUnit("T")).toBeNull();
      expect(canonicalizeUnit("  T  ")).toBeNull();
      expect(canonicalizeUnit("t.")).toBeNull();
      expect(canonicalizeUnit("T.")).toBeNull();
    });

    it("has no 't' key left in the table", () => {
      expect(Object.prototype.hasOwnProperty.call(UNIT_MAPPINGS, "t")).toBe(
        false
      );
    });

    it("still resolves the unambiguous spoon abbreviations", () => {
      expect(canonicalizeUnit("tbsp")).toBe("tablespoon");
      expect(canonicalizeUnit("tbsp.")).toBe("tablespoon");
      expect(canonicalizeUnit("TBSP.")).toBe("tablespoon");
      expect(canonicalizeUnit("tbs")).toBe("tablespoon");
      expect(canonicalizeUnit("tbs.")).toBe("tablespoon");
      expect(canonicalizeUnit("tsp")).toBe("teaspoon");
      expect(canonicalizeUnit("tsp.")).toBe("teaspoon");
      expect(canonicalizeUnit("Tsp.")).toBe("teaspoon");
    });
  });

  describe("punctuated and alternate spellings", () => {
    /**
     * Every abbreviation carries a trailing-period twin, because recipe text
     * punctuates abbreviations freely and an unmapped spelling would be
     * written to `units` as a junk `unreviewed` row.
     */
    const ABBREVIATIONS = [
      "c",
      "tbsp",
      "tbsps",
      "tbs",
      "tsp",
      "tsps",
      "fl oz",
      "fluid oz",
      "floz",
      "ml",
      "mls",
      "l",
      "pt",
      "pts",
      "qt",
      "qts",
      "gal",
      "gals",
      "oz",
      "ozs",
      "lb",
      "lbs",
      "g",
      "gs",
      "gr",
      "kg",
      "kgs",
      "pc",
      "pcs",
      "pkg",
      "pkgs",
      "pkt",
    ];

    it.each(ABBREVIATIONS)(
      'resolves "%s" and "%s." to the same canonical name',
      (abbrev) => {
        const bare = canonicalizeUnit(abbrev);
        expect(bare).not.toBeNull();
        expect(canonicalizeUnit(`${abbrev}.`)).toBe(bare);
      }
    );

    it("keeps every trailing-period key in step with its bare form", () => {
      for (const key of Object.keys(UNIT_MAPPINGS)) {
        if (!key.endsWith(".")) continue;
        const bare = key.slice(0, -1);
        expect(canonicalizeUnit(bare)).toBe(UNIT_MAPPINGS[key]);
      }
    });

    const ADDED_SPELLINGS: Array<[string, string]> = [
      ["fluid oz", "fluid ounce"],
      ["fluid oz.", "fluid ounce"],
      ["fl oz.", "fluid ounce"],
      ["floz", "fluid ounce"],
      ["floz.", "fluid ounce"],
      ["packet", "package"],
      ["packets", "package"],
      ["pkt", "package"],
      ["pkt.", "package"],
      ["tin", "can"],
      ["tins", "can"],
      ["gramme", "gram"],
      ["grammes", "gram"],
      ["kg.", "kilogram"],
      ["g.", "gram"],
      ["ml.", "milliliter"],
    ];

    it.each(ADDED_SPELLINGS)('resolves "%s" to "%s"', (spelling, canonical) => {
      expect(canonicalizeUnit(spelling)).toBe(canonical);
    });
  });

  /**
   * The canonical names are exactly the names seeded into the `units` table.
   * Inventing a new one would mean `resolveUnitId` inserts an `unreviewed`
   * row instead of hitting the seeded row, so the set is pinned here.
   */
  describe("canonical names", () => {
    const SEEDED_UNITS = [
      "bag",
      "bottle",
      "box",
      "bunch",
      "can",
      "clove",
      "cube",
      "cup",
      "dash",
      "fluid ounce",
      "gallon",
      "gram",
      "head",
      "jar",
      "kilogram",
      "leaf",
      "liter",
      "milliliter",
      "ounce",
      "package",
      "piece",
      "pinch",
      "pint",
      "pound",
      "quart",
      "slice",
      "sprig",
      "stalk",
      "stick",
      "tablespoon",
      "teaspoon",
      "whole",
    ];

    it("introduces no canonical name that is not a seeded unit", () => {
      const canonicals = [...new Set(Object.values(UNIT_MAPPINGS))].sort();
      expect(canonicals).toEqual(SEEDED_UNITS);
    });

    it("leaves every seeded unit reachable from at least one spelling", () => {
      const canonicals = new Set(Object.values(UNIT_MAPPINGS));
      for (const name of SEEDED_UNITS) {
        expect(canonicals.has(name)).toBe(true);
        expect(canonicalizeUnit(name)).toBe(name);
      }
    });
  });
});

describe("parseIngredient with ambiguous or punctuated units", () => {
  it('leaves "1 t vanilla extract" unresolved rather than tripling it', () => {
    const result = parseIngredient("1 t vanilla extract");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBeNull();
    expect(result.ingredientName).toBe("t vanilla extract");
  });

  it('leaves "1 T vanilla extract" unresolved too', () => {
    const result = parseIngredient("1 T vanilla extract");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBeNull();
    expect(result.ingredientName).toBe("T vanilla extract");
  });

  it('parses "2 tbsp. olive oil"', () => {
    const result = parseIngredient("2 tbsp. olive oil");
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("tablespoon");
    expect(result.ingredientName).toBe("olive oil");
  });

  it('parses "1/2 tsp. salt"', () => {
    const result = parseIngredient("1/2 tsp. salt");
    expect(result.quantity).toBeCloseTo(0.5);
    expect(result.unit).toBe("teaspoon");
    expect(result.ingredientName).toBe("salt");
  });

  it('parses "1 tin chopped tomatoes"', () => {
    const result = parseIngredient("1 tin chopped tomatoes");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("can");
    expect(result.ingredientName).toBe("chopped tomatoes");
  });

  it('parses "2 packets yeast"', () => {
    const result = parseIngredient("2 packets yeast");
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("package");
    expect(result.ingredientName).toBe("yeast");
  });

  it('parses "500 grammes flour"', () => {
    const result = parseIngredient("500 grammes flour");
    expect(result.quantity).toBe(500);
    expect(result.unit).toBe("gram");
    expect(result.ingredientName).toBe("flour");
  });

  it('parses "12 fluid oz. stock"', () => {
    const result = parseIngredient("12 fluid oz. stock");
    expect(result.quantity).toBe(12);
    expect(result.unit).toBe("fluid ounce");
    expect(result.ingredientName).toBe("stock");
  });
});

/**
 * "1½ cups" is standard typography on the major recipe sites. The fraction
 * used to be recognized only at position 0, so a glyph following a whole number
 * was dropped three ways at once: the quantity lost the fraction (1½ -> 1), the
 * orphaned glyph then blocked the unit, and it ended up in the name.
 */
describe("parseIngredient with mixed Unicode fractions", () => {
  const GLYPHS: Array<[string, number]> = [
    ["½", 0.5],
    ["⅓", 1 / 3],
    ["⅔", 2 / 3],
    ["¼", 0.25],
    ["¾", 0.75],
    ["⅕", 0.2],
    ["⅖", 0.4],
    ["⅗", 0.6],
    ["⅘", 0.8],
    ["⅙", 1 / 6],
    ["⅚", 5 / 6],
    ["⅛", 0.125],
    ["⅜", 3 / 8],
    ["⅝", 5 / 8],
    ["⅞", 7 / 8],
  ];

  it("covers every glyph the parser knows about", () => {
    expect(GLYPHS.map(([glyph]) => glyph).sort()).toEqual(
      Object.keys(UNICODE_FRACTIONS).sort()
    );
  });

  it.each(GLYPHS)('parses the unspaced "1%s cups flour"', (glyph, value) => {
    const result = parseIngredient(`1${glyph} cups flour`);
    expect(result.quantity).toBeCloseTo(1 + value);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("flour");
  });

  it.each(GLYPHS)('parses the spaced "1 %s cups flour"', (glyph, value) => {
    const result = parseIngredient(`1 ${glyph} cups flour`);
    expect(result.quantity).toBeCloseTo(1 + value);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("flour");
  });

  it.each(GLYPHS)('still parses the lone "%s cup water"', (glyph, value) => {
    const result = parseIngredient(`${glyph} cup water`);
    expect(result.quantity).toBeCloseTo(value);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("water");
  });

  it('parses "1½ cups granulated sugar"', () => {
    const result = parseIngredient("1½ cups granulated sugar");
    expect(result.quantity).toBeCloseTo(1.5);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("granulated sugar");
    expect(result.notes).toBeNull();
  });

  it('parses "1 ½ cups granulated sugar"', () => {
    const result = parseIngredient("1 ½ cups granulated sugar");
    expect(result.quantity).toBeCloseTo(1.5);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("granulated sugar");
  });

  it('parses a multi-digit whole number, "12¾ ounces chocolate"', () => {
    const result = parseIngredient("12¾ ounces chocolate");
    expect(result.quantity).toBeCloseTo(12.75);
    expect(result.unit).toBe("ounce");
    expect(result.ingredientName).toBe("chocolate");
  });

  it("never leaves a fraction glyph in the ingredient name", () => {
    for (const [glyph] of GLYPHS) {
      expect(parseIngredient(`2${glyph} teaspoons salt`).ingredientName).toBe("salt");
      expect(parseIngredient(`2 ${glyph} teaspoons salt`).ingredientName).toBe("salt");
    }
  });

  it("handles a glyph welded straight onto the unit", () => {
    const result = parseIngredient("1½cups flour");
    expect(result.quantity).toBeCloseTo(1.5);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("flour");
  });
});

/**
 * Ranges keep their low end, the convention "10-12 cherry tomatoes" already
 * established. Only the ASCII hyphen used to be recognized, so a typographic
 * en dash or a spelled-out "to" left the high end sitting in the name.
 */
describe("parseIngredient with ranges", () => {
  const SEPARATORS: Array<[string, string]> = [
    ["hyphen", "2-3 tablespoons olive oil"],
    ["spaced hyphen", "2 - 3 tablespoons olive oil"],
    ["en dash", "2–3 tablespoons olive oil"],
    ["spaced en dash", "2 – 3 tablespoons olive oil"],
    ["em dash", "2—3 tablespoons olive oil"],
    ["the word to", "2 to 3 tablespoons olive oil"],
  ];

  it.each(SEPARATORS)("takes the low end across a %s", (_label, line) => {
    const result = parseIngredient(line);
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("tablespoon");
    expect(result.ingredientName).toBe("olive oil");
  });

  it('parses "1 to 2 pounds boneless chicken thighs"', () => {
    const result = parseIngredient("1 to 2 pounds boneless chicken thighs");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("pound");
    expect(result.ingredientName).toBe("boneless chicken thighs");
  });

  it("ranges over fractions and decimals too", () => {
    expect(parseIngredient("1/2-1 teaspoon chili flakes").quantity).toBeCloseTo(0.5);
    expect(parseIngredient("1.5–2 cups stock").quantity).toBeCloseTo(1.5);
    expect(parseIngredient("1½ to 2 cups stock").quantity).toBeCloseTo(1.5);
  });

  it('keeps "Salt to taste" whole — "to" is only a separator between numbers', () => {
    const result = parseIngredient("Salt to taste");
    expect(result.quantity).toBeNull();
    expect(result.ingredientName).toBe("Salt to taste");
  });

  it('reads "1-1/2 cups whole milk" as a mixed number, not a range', () => {
    const result = parseIngredient("1-1/2 cups whole milk");
    expect(result.quantity).toBeCloseTo(1.5);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("whole milk");
  });

  /**
   * A number hyphenated onto a word is a dimension. Taking the number left the
   * name starting with a stray "-inch", which is what reached the ingredients
   * table; keeping the compound whole is the conservative reading.
   */
  it('leaves "1-inch piece fresh ginger" alone', () => {
    const result = parseIngredient("1-inch piece fresh ginger");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.ingredientName).toBe("1-inch piece fresh ginger");
  });
});

/**
 * "1 (14.5 ounce) can diced tomatoes" is everywhere on US sites. The
 * parenthetical sat between the quantity and the unit and blocked the unit
 * match outright. Its content is a package size, so it is captured as a note.
 */
describe("parseIngredient with parentheticals", () => {
  it('parses "1 (14.5 ounce) can diced tomatoes"', () => {
    const result = parseIngredient("1 (14.5 ounce) can diced tomatoes");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("can");
    expect(result.ingredientName).toBe("diced tomatoes");
    expect(result.notes).toBe("14.5 ounce");
  });

  it('parses "2 (15-ounce) cans chickpeas, drained and rinsed"', () => {
    const result = parseIngredient("2 (15-ounce) cans chickpeas, drained and rinsed");
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("can");
    expect(result.ingredientName).toBe("chickpeas");
    expect(result.notes).toBe("15-ounce, drained and rinsed");
  });

  it("captures a metric equivalent given mid-line", () => {
    const result = parseIngredient("1 cup (240 ml) whole milk");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("whole milk");
    expect(result.notes).toBe("240 ml");
  });

  it("captures a trailing parenthetical", () => {
    const result = parseIngredient("2 cups all-purpose flour (sifted)");
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("all-purpose flour");
    expect(result.notes).toBe("sifted");
  });

  it("keeps both a parenthetical and a trailing clause", () => {
    const result = parseIngredient("1 cup unsalted butter (2 sticks), melted");
    expect(result.ingredientName).toBe("unsalted butter");
    expect(result.notes).toBe("2 sticks, melted");
  });

  it("leaves an unbalanced parenthesis verbatim rather than mangling it", () => {
    const result = parseIngredient("1 cup milk (whole");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("milk (whole");
    expect(result.notes).toBeNull();
  });

  it("ignores an empty parenthetical", () => {
    const result = parseIngredient("1 () can tomatoes");
    expect(result.unit).toBe("can");
    expect(result.ingredientName).toBe("tomatoes");
    expect(result.notes).toBeNull();
  });
});

/** A unit word at the head of a line brings its preposition with it. */
describe("parseIngredient with a leading unit and preposition", () => {
  it('parses "Pinch of flaky sea salt"', () => {
    const result = parseIngredient("Pinch of flaky sea salt");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe("pinch");
    expect(result.ingredientName).toBe("flaky sea salt");
  });

  it('parses "Dash of hot sauce"', () => {
    const result = parseIngredient("Dash of hot sauce");
    expect(result.unit).toBe("dash");
    expect(result.ingredientName).toBe("hot sauce");
  });

  it('parses "1 can of diced tomatoes"', () => {
    const result = parseIngredient("1 can of diced tomatoes");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("can");
    expect(result.ingredientName).toBe("diced tomatoes");
  });

  it('parses "2 cups of whole milk"', () => {
    const result = parseIngredient("2 cups of whole milk");
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("cup");
    expect(result.ingredientName).toBe("whole milk");
  });

  it('parses "a pinch of saffron threads"', () => {
    const result = parseIngredient("a pinch of saffron threads");
    expect(result.unit).toBe("pinch");
    expect(result.ingredientName).toBe("saffron threads");
  });

  it("only drops the preposition when a unit was actually matched", () => {
    const result = parseIngredient("Offal, trimmed");
    expect(result.unit).toBeNull();
    expect(result.ingredientName).toBe("Offal");
    expect(result.notes).toBe("trimmed");
  });
});

/**
 * `ingredientName` is upserted into the shared `ingredients` lookup table, so a
 * prep clause left on the name creates a second row for the same ingredient
 * ("flour" and "flour, sifted"). Splitting is deliberately cautious: an
 * unrecognized clause stays in the name, because a wrong split rewrites the
 * canonical name, which is worse than not splitting at all.
 */
describe("parseIngredient notes", () => {
  it("is null when the line carries no note", () => {
    expect(parseIngredient("2 cups all-purpose flour").notes).toBeNull();
    expect(parseIngredient("Fresh basil leaves").notes).toBeNull();
    expect(parseIngredient("").notes).toBeNull();
    expect(parseIngredient("   ").notes).toBeNull();
  });

  const SPLIT: Array<[string, string, string]> = [
    ["2 cups flour, sifted", "flour", "sifted"],
    ["1 cup butter, melted", "butter", "melted"],
    ["3 ripe bananas, mashed", "ripe bananas", "mashed"],
    ["6 cloves garlic, thinly sliced", "garlic", "thinly sliced"],
    ["1 head garlic, halved crosswise", "garlic", "halved crosswise"],
    ["1 jalapeño, seeds removed", "jalapeño", "seeds removed"],
    ["2 tablespoons unsalted butter, divided", "unsalted butter", "divided"],
    [
      "1 tablespoon kosher salt, plus more for serving",
      "kosher salt",
      "plus more for serving",
    ],
    ["Salt and pepper, to taste", "Salt and pepper", "to taste"],
    ["1 cup chicken stock, at room temperature", "chicken stock", "at room temperature"],
    ["4 scallions, cut into 1-inch lengths", "scallions", "cut into 1-inch lengths"],
    ["1 cup pecans, optional", "pecans", "optional"],
    [
      "1 pound carrots, peeled, cut into 2-inch coins",
      "carrots",
      "peeled, cut into 2-inch coins",
    ],
    ["1 cup butter, unsalted, softened", "butter, unsalted", "softened"],
  ];

  it.each(SPLIT)('splits "%s"', (line, name, notes) => {
    const result = parseIngredient(line);
    expect(result.ingredientName).toBe(name);
    expect(result.notes).toBe(notes);
  });

  /**
   * Clauses that name the product rather than a preparation. Splitting these
   * would quietly rename the ingredient, so they stay put.
   */
  const KEPT = [
    "1 bell pepper, red",
    "1 cup butter, unsalted",
    "2 cups flour, all-purpose",
    "1 cup milk, whole",
    "1 can tomatoes, canned",
    "8 ounces salmon, smoked",
    "1 cup cranberries, dried",
  ];

  it.each(KEPT)('leaves "%s" unsplit', (line) => {
    const result = parseIngredient(line);
    expect(result.notes).toBeNull();
    expect(result.ingredientName).toContain(",");
  });

  it("does not split a line with no comma at all", () => {
    const result = parseIngredient("2 tablespoons finely chopped parsley");
    expect(result.ingredientName).toBe("finely chopped parsley");
    expect(result.notes).toBeNull();
  });

  it("never leaves the name empty", () => {
    const result = parseIngredient(", chopped");
    expect(result.ingredientName).toBe(", chopped");
    expect(result.notes).toBeNull();
  });

  it("keeps the whole line when every clause is part of the name", () => {
    const result = parseIngredient("1 pound tomatoes, red, ripe");
    expect(result.ingredientName).toBe("tomatoes, red, ripe");
    expect(result.notes).toBeNull();
  });
});
