import { describe, expect, it } from "vitest";

import {
  canonicalizeUnit,
  parseIngredient,
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

    it('parses "a pinch of sugar"', () => {
      const result = parseIngredient("a pinch of sugar");
      expect(result.quantity).toBeNull();
      expect(result.unit).toBe("pinch");
      expect(result.ingredientName).toBe("of sugar");
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
