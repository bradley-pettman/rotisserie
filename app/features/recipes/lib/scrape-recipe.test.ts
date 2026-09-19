import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scrapeRecipe, stripHtml } from "~/features/recipes/lib/scrape-recipe";

/**
 * This suite must never touch the network — it runs in CI. `globalThis.fetch`
 * is replaced with a `vi.fn()` before every test and restored afterwards, and
 * every fixture below is inline HTML. Any real request would surface as an
 * unstubbed-call failure rather than a silent outbound connection.
 */

const RECIPE_URL = "https://example.com/recipes/brown-butter-banana-bread";

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Queue a fake HTML response for the next `fetch`. */
function respondWith(
  html: string,
  init: { status?: number; statusText?: string } = {},
): void {
  const status = init.status ?? 200;
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    text: async () => html,
  });
}

/** Wrap a recipe object in a minimal but well-formed JSON-LD page. */
function jsonLdPage(recipe: Record<string, unknown>): string {
  const payload = JSON.stringify(
    { "@context": "https://schema.org", "@type": "Recipe", ...recipe },
    null,
    2,
  );
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <script type="application/ld+json">
${payload}
    </script>
  </head>
  <body></body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Plain JSON-LD, the way a WordPress/Yoast site emits it: HTML entities left
 * encoded inside the script body, ragged indentation, markup in the prose.
 */
const BANANA_BREAD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Brown Butter Banana Bread &amp; Walnuts &ndash; Flour &amp; Salt</title>
  <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Recipe",
       "name":"Brown Butter Banana Bread &amp; Walnuts",
       "description":"A loaf that keeps for days &mdash; if it lasts that long.",
       "prepTime":"PT20M",
       "cookTime":"PT1H5M",
       "recipeYield":"12 slices",
       "recipeIngredient":["3 ripe bananas, mashed","1/2 cup unsalted butter, browned","2 cups all-purpose flour","1 tsp baking soda","1 1/2 cups whole milk"],
       "recipeInstructions":"<p>Preheat the oven to 350&deg;F.</p><p>Butter a 9x5 loaf pan and line it with parchment.</p>"}
  </script>
</head>
<body>
  <h1>Brown Butter Banana Bread</h1>
</body>
</html>`;

/** Yoast-style `@graph`: the Recipe sits behind several unrelated nodes. */
const GRAPH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <script type="application/ld+json" class="yoast-schema-graph">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": "https://example.com/#website", "name": "Flour &amp; Salt" },
      { "@type": "WebPage", "@id": "https://example.com/short-ribs/#webpage", "isPartOf": { "@id": "https://example.com/#website" } },
      { "@type": "Person", "@id": "https://example.com/#/schema/person/1", "name": "Marguerite Boyd" },
      {
        "@type": "Recipe",
        "name": "Red Wine Braised Short Ribs",
        "description": "Low and slow, then rested overnight.",
        "prepTime": "PT30M",
        "cookTime": "PT3H",
        "recipeYield": ["6", "6 servings"],
        "recipeIngredient": [
          "2 lbs boneless short ribs",
          "1 head garlic, halved crosswise",
          "1 bunch flat-leaf parsley"
        ],
        "recipeInstructions": [
          { "@type": "HowToStep", "name": "Sear", "text": "Pat the ribs dry and sear them <strong>hard</strong> on every side." },
          { "@type": "HowToStep", "name": "Braise", "text": "Add the wine, cover, and braise at 300&#176;F for 3 hours." }
        ]
      }
    ]
  }
  </script>
</head>
<body></body>
</html>`;

/** News sites often dual-type a recipe article. */
const TYPE_ARRAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": ["Recipe", "NewsArticle"],
    "headline": "The only weeknight pasta you need",
    "name": "Garlic &amp; Chile Spaghetti",
    "cookTime": "PT15M",
    "recipeYield": 4,
    "recipeIngredient": ["1 lb spaghetti", "6 cloves garlic, thinly sliced"],
    "recipeInstructions": ["Boil the pasta in well-salted water.", "Bloom the chile in warm oil."]
  }
  </script>
</head>
<body></body>
</html>`;

/**
 * `HowToSection` wrapping nested `HowToStep`s, plus one bare step at the top
 * level. This is the shape the original plan did not account for.
 */
const SECTION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Hand Pies",
    "recipeYield": "8 pies",
    "recipeIngredient": ["2 cups all-purpose flour", "6 oz bittersweet chocolate, chopped"],
    "recipeInstructions": [
      {
        "@type": "HowToSection",
        "name": "For the dough",
        "itemListElement": [
          { "@type": "HowToStep", "text": "Cut the butter into the flour until it looks like coarse meal." },
          { "@type": "HowToStep", "text": "Add ice water a tablespoon at a time, then chill 1 hour." }
        ]
      },
      {
        "@type": "HowToSection",
        "name": "For the filling",
        "itemListElement": [
          { "@type": "HowToStep", "text": "Melt the chocolate with a pinch of salt." }
        ]
      },
      { "@type": "HowToStep", "text": "Crimp, vent, and bake until deep golden." }
    ]
  }
  </script>
</head>
<body></body>
</html>`;

/**
 * Three blocks: a valid non-recipe, a truncated one that cannot be parsed, and
 * the real recipe last. The scrape must survive the middle block.
 */
const MALFORMED_THEN_VALID_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Organization","name":"Flour &amp; Salt","url":"https://example.com"}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Recipe","name":"Buttermilk Biscuits","prepTime":"PT15M","cookTime":"PT12M","recipeYield":"10 biscuits","recipeIngredient":["2 cups all-purpose flour","1 1/2 cups whole milk"],"recipeInstructions":"Fold the dough over itself six times, then cut straight down."}
  </script>
</head>
<body></body>
</html>`;

/**
 * Microdata only. The author's nested itemscope deliberately precedes the
 * title so that a naive `itemprop="name"` grab would return the byline.
 */
const MICRODATA_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Skillet Cornbread</title></head>
<body>
  <article itemscope itemtype="http://schema.org/Recipe">
    <span class="byline" itemprop="author" itemscope itemtype="http://schema.org/Person">
      By <span itemprop="name">Marguerite Boyd</span>
    </span>

    <h1 itemprop="name">Skillet   Cornbread</h1>
    <p itemprop="description">Crisp edges, tender middle &mdash; straight from a screaming-hot pan.</p>

    <time itemprop="prepTime" datetime="PT10M">10 min</time>
    <meta itemprop="cookTime" content="PT25M" />
    <span itemprop="recipeYield">Serves 8</span>

    <ul class="ingredients">
      <li itemprop="recipeIngredient">1 1/2 cups stone-ground cornmeal</li>
      <li itemprop="recipeIngredient">1 cup buttermilk</li>
      <li itemprop="recipeIngredient">2 tbsp bacon drippings</li>
    </ul>

    <div itemprop="recipeInstructions">
      <ol>
        <li>Heat the skillet in a 450&deg;F oven until it&#39;s smoking.</li>
        <li>Whisk the dry ingredients, then fold in the <em>buttermilk</em>.</li>
      </ol>
    </div>
  </article>
</body>
</html>`;

/** Structured data, but nothing resembling a recipe. */
const NO_RECIPE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"NewsArticle","headline":"Ten pans we actually use","author":{"@type":"Person","name":"Marguerite Boyd"}}
  </script>
</head>
<body>
  <article itemscope itemtype="https://schema.org/NewsArticle">
    <h1 itemprop="headline">Ten pans we actually use</h1>
  </article>
</body>
</html>`;

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("scrapeRecipe", () => {
  describe("fetching", () => {
    it("requests the given URL with the Rotisserie user agent and a timeout signal", async () => {
      respondWith(BANANA_BREAD_HTML);

      await scrapeRecipe(RECIPE_URL);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(RECIPE_URL);
      expect(
        (init.headers as Record<string, string>)["User-Agent"],
      ).toBe("Mozilla/5.0 (compatible; Rotisserie/1.0)");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("echoes the requested URL back as sourceUrl", async () => {
      respondWith(BANANA_BREAD_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.sourceUrl).toBe(RECIPE_URL);
    });
  });

  describe("JSON-LD: a straightforward recipe", () => {
    it("maps every scalar field", async () => {
      respondWith(BANANA_BREAD_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).toBe("Brown Butter Banana Bread & Walnuts");
      expect(recipe.notes).toBe("A loaf that keeps for days — if it lasts that long.");
      expect(recipe.prepTimeMinutes).toBe(20);
      expect(recipe.cookTimeMinutes).toBe(65);
      expect(recipe.servings).toBe(12);
    });

    it("splits a paragraph-wrapped instruction string into blank-line-separated steps", async () => {
      respondWith(BANANA_BREAD_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).toBe(
        "Preheat the oven to 350°F.\n\nButter a 9x5 loaf pan and line it with parchment.",
      );
    });

    it("runs each recipeIngredient through parseIngredient", async () => {
      respondWith(BANANA_BREAD_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.ingredients).toEqual([
        { ingredientName: "ripe bananas", quantity: 3, unit: null, notes: "mashed" },
        { ingredientName: "unsalted butter", quantity: 0.5, unit: "cup", notes: "browned" },
        { ingredientName: "all-purpose flour", quantity: 2, unit: "cup", notes: null },
        { ingredientName: "baking soda", quantity: 1, unit: "teaspoon", notes: null },
        { ingredientName: "whole milk", quantity: 1.5, unit: "cup", notes: null },
      ]);
    });

    /**
     * Schema.org has no per-ingredient notes field, so `notes` can only come
     * from splitting the one freeform string. It has to be split: the name is
     * upserted into the shared `ingredients` table, so "unsalted butter,
     * browned" would otherwise create its own row next to "unsalted butter".
     */
    it("splits preparation notes off the ingredient name", async () => {
      respondWith(BANANA_BREAD_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.ingredients.map((row) => row.notes)).toEqual([
        "mashed",
        "browned",
        null,
        null,
        null,
      ]);
      expect(recipe.ingredients.every((row) => !row.ingredientName.includes(","))).toBe(
        true,
      );
    });
  });

  describe("JSON-LD: recipe nested inside @graph", () => {
    it("finds the Recipe behind the WebSite, WebPage and Person nodes", async () => {
      respondWith(GRAPH_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).toBe("Red Wine Braised Short Ribs");
      expect(recipe.prepTimeMinutes).toBe(30);
      expect(recipe.cookTimeMinutes).toBe(180);
    });

    it("does not mistake the Person node's name for the recipe name", async () => {
      respondWith(GRAPH_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).not.toBe("Marguerite Boyd");
    });

    it("parses the ingredients from the nested node", async () => {
      respondWith(GRAPH_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.ingredients).toEqual([
        { ingredientName: "boneless short ribs", quantity: 2, unit: "pound", notes: null },
        { ingredientName: "garlic", quantity: 1, unit: "head", notes: "halved crosswise" },
        { ingredientName: "flat-leaf parsley", quantity: 1, unit: "bunch", notes: null },
      ]);
    });
  });

  describe("JSON-LD: @type given as an array", () => {
    it('matches ["Recipe", "NewsArticle"]', async () => {
      respondWith(TYPE_ARRAY_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).toBe("Garlic & Chile Spaghetti");
      expect(recipe.cookTimeMinutes).toBe(15);
    });

    it("tolerates a bare http://schema.org @context and array-of-strings instructions", async () => {
      respondWith(TYPE_ARRAY_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).toBe(
        "Boil the pasta in well-salted water.\n\nBloom the chile in warm oil.",
      );
    });
  });

  describe("JSON-LD: instruction shapes", () => {
    it("reads .text from HowToStep objects and strips markup inside it", async () => {
      respondWith(GRAPH_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).toBe(
        "Pat the ribs dry and sear them hard on every side.\n\n" +
          "Add the wine, cover, and braise at 300°F for 3 hours.",
      );
    });

    it("flattens HowToSection.itemListElement into the step list", async () => {
      respondWith(SECTION_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).toBe(
        "Cut the butter into the flour until it looks like coarse meal.\n\n" +
          "Add ice water a tablespoon at a time, then chill 1 hour.\n\n" +
          "Melt the chocolate with a pinch of salt.\n\n" +
          "Crimp, vent, and bake until deep golden.",
      );
    });

    it("does not emit HowToSection names as steps", async () => {
      respondWith(SECTION_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).not.toContain("For the dough");
      expect(recipe.instructions).not.toContain("For the filling");
    });

    it("returns null instructions when the field is absent", async () => {
      respondWith(jsonLdPage({ name: "Buttered Toast", recipeIngredient: ["2 slices bread"] }));

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).toBeNull();
    });
  });

  describe("JSON-LD: recipeYield shapes", () => {
    it('reads a string yield ("4 servings")', async () => {
      respondWith(jsonLdPage({ name: "Chili", recipeYield: "4 servings" }));

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBe(4);
    });

    it('reads a trailing integer ("Serves 6")', async () => {
      respondWith(jsonLdPage({ name: "Chili", recipeYield: "Serves 6" }));

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBe(6);
    });

    it("reads a numeric yield", async () => {
      respondWith(jsonLdPage({ name: "Chili", recipeYield: 8 }));

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBe(8);
    });

    it("reads the first usable entry of an array yield", async () => {
      respondWith(jsonLdPage({ name: "Chili", recipeYield: ["6", "6 servings"] }));

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBe(6);
    });

    it("reads a QuantitativeValue yield object", async () => {
      respondWith(
        jsonLdPage({
          name: "Chili",
          recipeYield: { "@type": "QuantitativeValue", value: 12, unitText: "servings" },
        }),
      );

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBe(12);
    });

    it("returns null when the yield carries no number", async () => {
      respondWith(jsonLdPage({ name: "Chili", recipeYield: "a generous amount" }));

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBeNull();
    });

    it("returns null when recipeYield is missing entirely", async () => {
      respondWith(jsonLdPage({ name: "Chili" }));

      expect((await scrapeRecipe(RECIPE_URL)).servings).toBeNull();
    });
  });

  describe("JSON-LD: duration fields", () => {
    it("trims whitespace-padded ISO durations before parsing them", async () => {
      respondWith(jsonLdPage({ name: "Chili", prepTime: "  PT25M ", cookTime: "\nPT1H10M\n" }));

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.prepTimeMinutes).toBe(25);
      expect(recipe.cookTimeMinutes).toBe(70);
    });

    it("returns null for a non-ISO duration rather than guessing", async () => {
      respondWith(jsonLdPage({ name: "Chili", prepTime: "about 20 minutes" }));

      expect((await scrapeRecipe(RECIPE_URL)).prepTimeMinutes).toBeNull();
    });

    it("returns null when the duration fields are absent", async () => {
      respondWith(jsonLdPage({ name: "Chili" }));

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.prepTimeMinutes).toBeNull();
      expect(recipe.cookTimeMinutes).toBeNull();
    });
  });

  describe("JSON-LD: malformed blocks", () => {
    it("skips an unparseable block and uses the valid recipe that follows it", async () => {
      respondWith(MALFORMED_THEN_VALID_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).toBe("Buttermilk Biscuits");
      expect(recipe.prepTimeMinutes).toBe(15);
      expect(recipe.cookTimeMinutes).toBe(12);
      expect(recipe.servings).toBe(10);
    });

    it("skips valid-but-irrelevant blocks (Organization) without giving up", async () => {
      respondWith(MALFORMED_THEN_VALID_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).not.toBe("Flour & Salt");
      expect(recipe.ingredients).toHaveLength(2);
    });

    it("falls through to the no-recipe error when every block is malformed", async () => {
      respondWith(`<html><head>
        <script type="application/ld+json">{ "@type": "Recipe", </script>
        <script type="application/ld+json">not json at all</script>
      </head><body></body></html>`);

      await expect(scrapeRecipe(RECIPE_URL)).rejects.toThrow(
        "Could not find recipe data on this page.",
      );
    });

    it('ignores a script whose type is on a data- attribute', async () => {
      respondWith(`<html><head>
        <script data-type="application/ld+json">{"@type":"Recipe","name":"Decoy"}</script>
      </head><body></body></html>`);

      await expect(scrapeRecipe(RECIPE_URL)).rejects.toThrow(
        "Could not find recipe data on this page.",
      );
    });
  });

  describe("microdata fallback", () => {
    it("extracts the scalar fields when there is no JSON-LD", async () => {
      respondWith(MICRODATA_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).toBe("Skillet Cornbread");
      expect(recipe.notes).toBe(
        "Crisp edges, tender middle — straight from a screaming-hot pan.",
      );
      expect(recipe.prepTimeMinutes).toBe(10);
      expect(recipe.cookTimeMinutes).toBe(25);
      expect(recipe.servings).toBe(8);
    });

    it("ignores itemprops belonging to a nested itemscope such as the author", async () => {
      respondWith(MICRODATA_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).not.toBe("Marguerite Boyd");
    });

    it("collects one ingredient per itemprop element", async () => {
      respondWith(MICRODATA_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.ingredients).toEqual([
        { ingredientName: "stone-ground cornmeal", quantity: 1.5, unit: "cup", notes: null },
        { ingredientName: "buttermilk", quantity: 1, unit: "cup", notes: null },
        { ingredientName: "bacon drippings", quantity: 2, unit: "tablespoon", notes: null },
      ]);
    });

    it("splits a single recipeInstructions element containing a list into steps", async () => {
      respondWith(MICRODATA_HTML);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.instructions).toBe(
        "Heat the skillet in a 450°F oven until it's smoking.\n\n" +
          "Whisk the dry ingredients, then fold in the buttermilk.",
      );
    });

    it("prefers JSON-LD when a page carries both", async () => {
      respondWith(`${BANANA_BREAD_HTML}\n${MICRODATA_HTML}`);

      const recipe = await scrapeRecipe(RECIPE_URL);

      expect(recipe.name).toBe("Brown Butter Banana Bread & Walnuts");
    });
  });

  describe("pages with no recipe data", () => {
    it("throws the exact documented message", async () => {
      respondWith(NO_RECIPE_HTML);

      await expect(scrapeRecipe(RECIPE_URL)).rejects.toThrow(
        "Could not find recipe data on this page.",
      );
    });

    it("throws the same message for a page with no structured data at all", async () => {
      respondWith("<!DOCTYPE html><html><body><h1>404</h1></body></html>");

      await expect(scrapeRecipe(RECIPE_URL)).rejects.toThrow(
        "Could not find recipe data on this page.",
      );
    });
  });

  describe("failure modes", () => {
    it("reports the status for a non-200 response", async () => {
      respondWith("<html><body>Not found</body></html>", {
        status: 404,
        statusText: "Not Found",
      });

      await expect(scrapeRecipe(RECIPE_URL)).rejects.toThrow("That page returned 404 Not Found.");
    });

    it("reports a 500 distinctly from a missing recipe", async () => {
      respondWith("", { status: 500, statusText: "Internal Server Error" });

      const thrown = (await scrapeRecipe(RECIPE_URL).catch(
        (error: unknown) => error,
      )) as Error;

      expect(thrown.message).toContain("500");
      expect(thrown.message).not.toContain("Could not find recipe data");
    });

    it("wraps a network failure in a readable message", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));

      await expect(scrapeRecipe(RECIPE_URL)).rejects.toThrow(
        "Could not reach that page: fetch failed",
      );
    });

    it("propagates an AbortError unchanged so callers can detect a timeout", async () => {
      const abortError = new Error("The operation was aborted due to timeout");
      abortError.name = "AbortError";
      fetchMock.mockRejectedValue(abortError);

      const thrown = await scrapeRecipe(RECIPE_URL).catch((error: unknown) => error);

      expect(thrown).toBe(abortError);
      expect((thrown as Error).name).toBe("AbortError");
    });

    it("also treats a TimeoutError rejection as a timeout and rethrows it as-is", async () => {
      const timeoutError = new Error("The operation timed out");
      timeoutError.name = "TimeoutError";
      fetchMock.mockRejectedValue(timeoutError);

      const thrown = await scrapeRecipe(RECIPE_URL).catch((error: unknown) => error);

      expect(thrown).toBe(timeoutError);
    });

    it("propagates an abort raised while reading the body", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => {
          throw abortError;
        },
      });

      const thrown = await scrapeRecipe(RECIPE_URL).catch((error: unknown) => error);

      expect(thrown).toBe(abortError);
    });
  });
});

describe("stripHtml", () => {
  it("removes tags", () => {
    expect(stripHtml("<p>Fold in the <em>buttermilk</em>.</p>")).toBe("Fold in the buttermilk.");
  });

  it("decodes the common named entities", () => {
    expect(stripHtml("Salt &amp; pepper &lt;to taste&gt; &quot;generously&quot; &#39;yes&#39;")).toBe(
      `Salt & pepper <to taste> "generously" 'yes'`,
    );
  });

  it("treats &nbsp; as an ordinary space", () => {
    expect(stripHtml("2&nbsp;cups&nbsp;&nbsp;flour")).toBe("2 cups flour");
  });

  it("decodes numeric and hex entities", () => {
    expect(stripHtml("350&#176;F &#x2014; hot")).toBe("350°F — hot");
  });

  it("decodes only one level, so &amp;lt; stays as literal &lt;", () => {
    expect(stripHtml("&amp;lt;not a tag&amp;gt;")).toBe("&lt;not a tag&gt;");
  });

  it("leaves unknown entities alone", () => {
    expect(stripHtml("caf&eacute; &notanentity;")).toBe("caf&eacute; &notanentity;");
  });

  it("turns paragraph boundaries into a blank line instead of joining words", () => {
    expect(stripHtml("<p>First step</p><p>Second step</p>")).toBe("First step\n\nSecond step");
  });

  it("turns a single <br> into one line break", () => {
    expect(stripHtml("First line<br />Second line")).toBe("First line\nSecond line");
  });

  it("drops inline tags without inserting stray spaces", () => {
    expect(stripHtml(`<a href="/flour">flour</a>, sifted`)).toBe("flour, sifted");
  });

  it("discards script and style bodies", () => {
    expect(stripHtml("<style>.a{color:red}</style>Mix<script>var x=1;</script> well")).toBe(
      "Mix well",
    );
  });

  it("collapses runs of whitespace and trims", () => {
    expect(stripHtml("   Skillet   \n\n\n   Cornbread   ")).toBe("Skillet\n\nCornbread");
  });

  it("returns an empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

/**
 * The scraper hands each `recipeIngredient` line to `parseIngredient` and
 * passes the result straight through, including the notes it splits off. These
 * cover the wiring end to end on the shapes real sites emit.
 */
describe("scrapeRecipe ingredient parsing", () => {
  it("keeps the fraction in a mixed Unicode quantity", async () => {
    respondWith(
      jsonLdPage({
        name: "Sugar Cookies",
        recipeIngredient: ["1½ cups granulated sugar", "1 ¼ teaspoons baking soda"],
      }),
    );

    const recipe = await scrapeRecipe(RECIPE_URL);

    expect(recipe.ingredients).toEqual([
      { ingredientName: "granulated sugar", quantity: 1.5, unit: "cup", notes: null },
      { ingredientName: "baking soda", quantity: 1.25, unit: "teaspoon", notes: null },
    ]);
  });

  it("takes the low end of a range written with an en dash or with 'to'", async () => {
    respondWith(
      jsonLdPage({
        name: "Chili Oil",
        recipeIngredient: ["2–3 tablespoons olive oil", "1 to 2 teaspoons chili flakes"],
      }),
    );

    const recipe = await scrapeRecipe(RECIPE_URL);

    expect(recipe.ingredients).toEqual([
      { ingredientName: "olive oil", quantity: 2, unit: "tablespoon", notes: null },
      { ingredientName: "chili flakes", quantity: 1, unit: "teaspoon", notes: null },
    ]);
  });

  it("reads the unit past a parenthetical package size and keeps it as a note", async () => {
    respondWith(
      jsonLdPage({
        name: "Weeknight Chili",
        recipeIngredient: [
          "1 (14.5 ounce) can diced tomatoes",
          "2 (15-ounce) cans black beans, drained and rinsed",
        ],
      }),
    );

    const recipe = await scrapeRecipe(RECIPE_URL);

    expect(recipe.ingredients).toEqual([
      {
        ingredientName: "diced tomatoes",
        quantity: 1,
        unit: "can",
        notes: "14.5 ounce",
      },
      {
        ingredientName: "black beans",
        quantity: 2,
        unit: "can",
        notes: "15-ounce, drained and rinsed",
      },
    ]);
  });

  it("drops the preposition after a leading unit word", async () => {
    respondWith(
      jsonLdPage({ name: "Finishing Salt", recipeIngredient: ["Pinch of flaky sea salt"] }),
    );

    const recipe = await scrapeRecipe(RECIPE_URL);

    expect(recipe.ingredients).toEqual([
      { ingredientName: "flaky sea salt", quantity: null, unit: "pinch", notes: null },
    ]);
  });

  /**
   * The point of the split: these four lines are one ingredient in the shared
   * `ingredients` table, not four.
   */
  it("collapses prep variations of one ingredient onto a single name", async () => {
    respondWith(
      jsonLdPage({
        name: "Butter Study",
        recipeIngredient: [
          "1 cup butter, melted",
          "1 cup butter, softened",
          "1 cup butter, cubed",
          "1 cup butter",
        ],
      }),
    );

    const recipe = await scrapeRecipe(RECIPE_URL);

    expect(new Set(recipe.ingredients.map((row) => row.ingredientName))).toEqual(
      new Set(["butter"]),
    );
    expect(recipe.ingredients.map((row) => row.notes)).toEqual([
      "melted",
      "softened",
      "cubed",
      null,
    ]);
  });

  it("leaves a name-forming clause on the ingredient name", async () => {
    respondWith(
      jsonLdPage({
        name: "Pepper Salad",
        recipeIngredient: ["1 bell pepper, red", "1 cup butter, unsalted"],
      }),
    );

    const recipe = await scrapeRecipe(RECIPE_URL);

    expect(recipe.ingredients.map((row) => row.ingredientName)).toEqual([
      "bell pepper, red",
      "butter, unsalted",
    ]);
    expect(recipe.ingredients.every((row) => row.notes === null)).toBe(true);
  });
});
