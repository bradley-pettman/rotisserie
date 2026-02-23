---
spec: SPEC-recipe-import.md
---

# Plan: Import Recipe from URL

## Tasks

- [x] <!-- id:parse-duration priority:1 deps: -->
  **Create ISO 8601 duration parser**
  Create `app/features/recipes/lib/parse-duration.ts` exporting a `parseDuration(iso: string): number | null` function.
  It must handle ISO 8601 duration strings like `PT30M` → 30, `PT1H30M` → 90, `PT2H` → 120, `P0DT1H0M` → 60.
  Return the total number of minutes as an integer, or `null` if the input is empty, undefined, or unparseable.
  Use a regex like `/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i` — no npm dependencies.
  Days should convert at 24h/day (1440 min). Seconds should be ignored (floor to minutes).
  Include a comprehensive set of inline JSDoc examples. The `lib/` directory under `app/features/recipes/` does not exist yet — create it.

- [x] <!-- id:parse-ingredient priority:1 deps: -->
  **Create ingredient string parser**
  Create `app/features/recipes/lib/parse-ingredient.ts` exporting a `parseIngredient(raw: string): { quantity: number | null; unit: string | null; ingredientName: string }` function.
  Given freeform ingredient strings from recipe sites (e.g. `"2 cups all-purpose flour"`, `"1/2 teaspoon salt"`, `"1 1/2 lbs chicken breast"`, `"Salt to taste"`, `"3 large eggs"`), extract:
  - **quantity**: The leading number. Handle integers (`2`), decimals (`1.5`), simple fractions (`1/2`), mixed numbers (`1 1/2`), and Unicode fraction characters (`½ ⅓ ⅔ ¼ ¾`). Return `null` if no number is found.
  - **unit**: Match the next word(s) against the known unit names and abbreviations from the database seed. The full unit list: cup, tablespoon/tbsp, teaspoon/tsp, fluid ounce/fl oz, milliliter/ml, liter/l, pint/pt, quart/qt, gallon/gal, ounce/oz, pound/lb, gram/g, kilogram/kg, piece/pc, whole, slice, clove, bunch, pinch, dash, sprig, head, stalk, leaf, can, package/pkg, jar, bottle, bag, box, stick, cube. Match should be case-insensitive and handle plurals (e.g. `"cups"` → `"cup"`, `"tablespoons"` → `"tablespoon"`, `"lbs"` → `"pound"`). Return the canonical unit name (not abbreviation). Return `null` if no unit matches.
  - **ingredientName**: Everything remaining after quantity and unit are stripped, trimmed. If nothing was extracted, return the original string trimmed as the ingredient name.
  No npm dependencies. Build a static lookup map of unit names/abbreviations/plurals at module level.

- [ ] <!-- id:scrape-recipe priority:2 deps:parse-duration,parse-ingredient -->
  **Create recipe URL scraper**
  Create `app/features/recipes/lib/scrape-recipe.ts` exporting a `scrapeRecipe(url: string): Promise<ScrapedRecipe>` function and a `ScrapedRecipe` type.
  The `ScrapedRecipe` type should match the shape needed to populate the recipe form:
  ```ts
  type ScrapedRecipe = {
    name: string | null;
    instructions: string | null;
    prepTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    servings: number | null;
    sourceUrl: string;
    notes: string | null;
    ingredients: Array<{ ingredientName: string; quantity: number | null; unit: string | null; notes: null }>;
  }
  ```
  Implementation steps:
  1. Fetch the URL with `fetch()` (Node built-in). Set `signal: AbortSignal.timeout(10_000)` for a 10-second timeout. Set a reasonable `User-Agent` header (e.g. `"Mozilla/5.0 (compatible; Rotisserie/1.0)"`).
  2. Extract JSON-LD: Use a regex to find all `<script type="application/ld+json">` blocks. `JSON.parse` each one. Look for an object with `"@type": "Recipe"` — it may be nested inside an `@graph` array or a top-level array. This is the primary extraction path.
  3. Microdata fallback: If no JSON-LD recipe is found, use regex to find elements with `itemtype` containing `schema.org/Recipe`. Extract `itemprop` values using regex patterns. This is best-effort — it won't work on every site but covers the common case.
  4. If neither method finds a recipe, throw an error with message `"Could not find recipe data on this page."`.
  5. Map the schema.org fields to `ScrapedRecipe`: use `parseDuration()` for `prepTime`/`cookTime`, `parseIngredient()` for each `recipeIngredient` string, extract leading integer from `recipeYield` for servings, join `recipeInstructions` array items with `\n\n` if it's an array (handle both string arrays and `HowToStep` objects with `.text` property), strip all HTML tags from text fields.
  6. Create a `stripHtml(html: string): string` helper (regex: `/<[^>]*>/g` → `""`, then decode common HTML entities like `&amp;`, `&lt;`, `&gt;`, `&#39;`, `&quot;`, then trim).
  If the fetch fails due to timeout, let the `AbortError` propagate — the action will catch it and return the appropriate error message. For other fetch errors (network failure, non-200 status), throw a descriptive error.
  No npm dependencies — use only Node built-in `fetch` and regex-based HTML extraction.

- [ ] <!-- id:import-ui priority:3 deps:scrape-recipe -->
  **Add import UI and action to the new-recipe page**
  Modify `app/features/recipes/routes/recipes.new.tsx` to add URL import functionality. This is the main integration task.
  **Action changes (server-side):**
  - Refactor the existing `action` to check for a hidden `intent` field. If `intent === "import"`, read the `url` field from form data, validate it's a valid http/https URL, call `scrapeRecipe(url)`, and return the result as JSON via `data()`. If the fetch times out (`error.name === "AbortError"`), return `{ importError: "The page took too long to respond." }`. If scraping fails, return `{ importError: error.message }`. If `intent` is absent or `"save"`, run the existing create recipe logic unchanged.
  **UI changes (client-side):**
  - Add a `useFetcher()` from `react-router` at the top of the component.
  - Above the existing form, add an "Import from URL" card/section containing: a URL `<Input>` (type="url", placeholder="https://example.com/recipe"), an "Import" `<Button>` that submits the fetcher form. Include a hidden `<input name="intent" value="import">`. Use the fetcher's `<fetcher.Form method="post">` so the page doesn't navigate.
  - Show a loading spinner or disabled state on the Import button while `fetcher.state !== "idle"`.
  - If `fetcher.data?.importError`, display the error message inline in a red alert/text below the URL input.
  **Form hydration:**
  - Add a `useEffect` that watches `fetcher.data`. When `fetcher.data` contains a successful scrape result (has `name` or `ingredients`), populate the form state: set `ingredients` state from the scraped ingredients array, set `tags` to `[]` (scraped data doesn't include tags). For the scalar fields (name, instructions, prepTimeMinutes, cookTimeMinutes, servings, sourceUrl, notes), use a `useRef` approach or controlled state to update the `<Input>` default values — since the form uses `defaultValue`, the simplest approach is to add a `key` prop to the form that changes on successful import (e.g. `key={importCount}`) so React re-mounts the form with new defaultValues, OR convert the scalar fields to controlled inputs with `useState`.
  - The recommended approach: add a `useState` for `importedData` (type `ScrapedRecipe | null`), set it from the `useEffect`, and use `importedData?.name ?? actionData?.input?.name ?? ""` as `defaultValue` for each field. Add a `key={importKey}` on the form that increments on each successful import to force re-render of uncontrolled inputs.
  **Important:** The existing save `<Form method="post">` must include `<input type="hidden" name="intent" value="save">` so the action knows to run the create flow. Keep the hidden `ingredients` and `tags` JSON fields as-is.
  Refer to the existing form structure in `recipes.new.tsx` (lines ~100-287) for the current layout. The import section should sit above the main form card, visually separated.

- [ ] <!-- id:e2e-tests priority:4 deps:import-ui -->
  **Add E2E tests for recipe URL import**
  Add a new `test.describe("Recipe Import from URL", ...)` block in `tests/recipes.spec.ts` following the existing test patterns (see existing describe blocks for style).
  Tests to write:
  1. **Invalid URL shows validation error** — Enter a non-URL string, click Import, verify an error message appears inline.
  2. **Successful import populates form fields** — This requires a real URL with JSON-LD recipe data. Use a stable, well-known recipe URL (e.g. from a major recipe site) OR create a simple local test fixture. The pragmatic approach: use `page.route()` to intercept the fetcher POST and mock the server response with a known `ScrapedRecipe` payload, then verify all form fields are populated. This avoids flaky external network deps in CI.
  3. **Import error displays inline message** — Mock the fetcher response to return `{ importError: "Could not find recipe data on this page." }` and verify the error text appears.
  4. **Imported recipe can be saved** — After a successful mock import, click Save and verify redirect to the new recipe detail page. Clean up the test recipe using the existing cleanup pattern (the cleanup panel with `data-testid="cleanup-toggle"`).
  Use `data-testid` attributes for the import-specific elements: `import-url-input`, `import-url-button`, `import-error`. Add these testids in the UI task if not already present.
  Follow the existing test patterns: `page.waitForURL()` for navigation, `page.getByTestId()` for custom selectors, `Date.now()` suffixes for unique test data names.
