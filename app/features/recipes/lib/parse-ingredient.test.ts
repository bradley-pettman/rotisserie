import { describe, expect, it } from "vitest";

import { parseIngredient } from "~/features/recipes/lib/parse-ingredient";

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
