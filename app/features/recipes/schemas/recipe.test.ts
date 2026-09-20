import { describe, expect, it } from "vitest";

import { createRecipeSchema, importRecipeSchema } from "./recipe";

/**
 * The URL constraint is the part of these schemas with a security consequence,
 * so it is the part that gets tested. `z.string().url()` accepts `javascript:`
 * and `data:`, and both spellings matter here for different reasons:
 * `sourceUrl` is rendered into an `href` by clients with no framework
 * sanitiser, and `importRecipeSchema.url` is handed to `fetch`, where `data:`
 * feeds the scraper attacker-authored bytes with no network request to vet.
 *
 * `httpUrl` is shared by both, so these also pin the refactor that extracted
 * it: `sourceUrl` must still accept the empty string an HTML form posts, and
 * must still accept `null`.
 */

/** A minimal body that `createRecipeSchema` accepts, plus an overridden field. */
function recipeWith(overrides: Record<string, unknown>) {
  return createRecipeSchema.safeParse({
    name: "Banana bread",
    instructions: "Mash. Mix. Bake.",
    ingredients: [
      { ingredientName: "bananas", quantity: 3, unit: null, notes: null },
    ],
    ...overrides,
  });
}

const DANGEROUS = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "ftp://example.com/recipe",
];

describe("importRecipeSchema", () => {
  it.each(["https://example.com/recipes/x", "http://example.com/recipes/x"])(
    "accepts %s",
    (url) => {
      expect(importRecipeSchema.safeParse({ url }).success).toBe(true);
    }
  );

  it.each(DANGEROUS)("refuses %s", (url) => {
    expect(importRecipeSchema.safeParse({ url }).success).toBe(false);
  });

  it("requires a url", () => {
    expect(importRecipeSchema.safeParse({}).success).toBe(false);
    expect(importRecipeSchema.safeParse({ url: "" }).success).toBe(false);
  });

  it("rejects an empty string rather than treating it as absent", () => {
    // `sourceUrl` deliberately accepts "" (an HTML form posting a blank field).
    // The import URL must not inherit that: there is nothing to scrape.
    expect(importRecipeSchema.safeParse({ url: "" }).success).toBe(false);
  });

  /**
   * Strict on purpose. A client sending `{url, name}` expecting the name to be
   * honoured should be told no, rather than handed a draft carrying the
   * scraper's guess at the name and left to wonder why.
   */
  it("refuses fields it does not understand", () => {
    const result = importRecipeSchema.safeParse({
      url: "https://example.com/x",
      name: "My name for it",
    });

    expect(result.success).toBe(false);
  });
});

describe("createRecipeSchema sourceUrl", () => {
  it.each(DANGEROUS)("refuses %s", (sourceUrl) => {
    expect(recipeWith({ sourceUrl }).success).toBe(false);
  });

  /**
   * REGRESSION. The scheme refine used to call `new URL(value)` unguarded, and
   * zod keeps running checks after a non-aborting `.url()` failure -- so a
   * malformed string reached it and threw a TypeError out of `safeParse`
   * instead of returning `{success: false}`. Through `POST /api/recipes` that
   * was a 500 with a stack trace where a 400 belonged.
   *
   * `safeParse` must never throw. That is the entire promise of its name.
   */
  it.each(["notaurl", "http://", "  ", "https://"])(
    "reports %j as invalid rather than throwing",
    (sourceUrl) => {
      expect(() => recipeWith({ sourceUrl })).not.toThrow();
      expect(recipeWith({ sourceUrl }).success).toBe(false);
    }
  );

  it("accepts an http(s) source", () => {
    expect(recipeWith({ sourceUrl: "https://example.com/x" }).success).toBe(true);
  });

  it("still accepts the empty string an HTML form posts, and null", () => {
    expect(recipeWith({ sourceUrl: "" }).success).toBe(true);
    expect(recipeWith({ sourceUrl: null }).success).toBe(true);
  });

  it("defaults to null when omitted", () => {
    const result = recipeWith({});

    expect(result.success).toBe(true);
    expect(result.success && result.data.sourceUrl).toBeNull();
  });
});
