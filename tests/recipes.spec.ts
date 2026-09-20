/**
 * E2E suite.
 *
 * Every recipe/tag here is created through the `recipes` fixture, which names
 * rows with this run's marker, records their ids and deletes exactly those rows
 * after each test (see tests/fixtures.ts and tests/db.ts). Tests therefore each
 * start from the seeded ingredients/units and no recipes of ours, which is what
 * makes the list and combobox assertions below deterministic.
 */
import {
  addIngredient,
  expect,
  expectComboboxFiltered,
  gotoRecipeForm,
  gotoRecipeList,
  test,
  type Page,
} from "./fixtures";

/**
 * The live-search debounce in app/features/recipes/routes/recipes.tsx. Keep in
 * step with the `setTimeout` there.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Sit out the live-search debounce and then some.
 *
 * A fixed wait is normally a smell, but here the thing under test *is* a
 * timer: the two tests below assert that a URL param is still there once the
 * debounce window the page opened has definitely closed. There is no event to
 * wait for — a passing run is precisely the one where nothing happens — so the
 * only honest signal is the clock. Twice the debounce plus a margin.
 */
async function outlastSearchDebounce(page: Page): Promise<void> {
  await page.waitForTimeout(SEARCH_DEBOUNCE_MS * 2 + 200);
}

test.describe("Rotisserie Recipe App", () => {
  test("The shell is present and / lands on the recipe list", async ({ page }) => {
    // `/` used to be a splash screen whose only job was to offer the two links
    // that are now permanently in the sidebar, so it redirects into the app.
    await page.goto("/");
    await expect(page).toHaveURL("/recipes");

    // The sidebar is a layout route, so every page inside the app has it.
    const nav = page.getByTestId("app-nav");
    await expect(nav.getByRole("link", { name: "Recipes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Plan" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "History" })).toBeVisible();

    await nav.getByRole("link", { name: "Plan" }).click();
    await expect(page).toHaveURL("/plan");
    // Still there after navigating: that is the whole point of the shell.
    await expect(page.getByTestId("app-nav")).toBeVisible();
  });

  test("Create a new recipe", async ({ page, recipes }) => {
    const recipeName = recipes.name("Test Recipe");
    const instructions = "Step 1: Mix ingredients\nStep 2: Cook for 20 minutes\nStep 3: Serve hot";

    // Create the recipe using our helper
    await recipes.create(recipeName, instructions, "garlic");

    // Verify recipe name appears on the page
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
  });

  test("Opening a recipe shows it in a drawer without losing the list", async ({
    page,
    recipes,
  }) => {
    const recipeName = recipes.name("View Test Recipe");
    const instructions = "Instructions for viewing test";

    await recipes.create(recipeName, instructions, "tomato");

    await gotoRecipeList(page);
    await page.getByRole("cell", { name: recipeName }).getByRole("button").click();

    // The drawer's title is the recipe, and the body carries both halves.
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
    await expect(page.getByText("Tomato")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();
    await expect(page.getByText(instructions)).toBeVisible();

    // The drawer is a URL parameter, so it is linkable...
    await expect(page).toHaveURL(/\?recipe=[a-f0-9-]+/);
    // ...and the list it opened over is still rendered behind it.
    await expect(page.getByTestId("recipe-table")).toBeVisible();

    // Back closes it and leaves the list exactly where it was.
    await page.goBack();
    await expect(page).not.toHaveURL(/\?recipe=/);
    await expect(page.getByRole("cell", { name: recipeName })).toBeVisible();
  });

  test("Edit a recipe", async ({ page, recipes }) => {
    const originalName = recipes.name("Edit Test Recipe");
    const updatedName = `Updated ${originalName}`;

    await recipes.create(originalName, "Original instructions", "potato");

    // Editing is reached from the drawer the create redirect just opened.
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/);

    await expect(page.getByLabel("Recipe Name")).toHaveValue(originalName);
    await page.getByLabel("Recipe Name").fill(updatedName);

    await page.getByRole("button", { name: "Save Changes" }).click();

    // Saving lands back in the drawer for the recipe just edited.
    await page.waitForURL(/\/recipes\?recipe=[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  });

  test("Delete a recipe", async ({ page, recipes }) => {
    const recipeName = recipes.name("Delete Test Recipe");

    await recipes.create(recipeName, "Instructions for delete test", "carrot");

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Deleting lives on the editor, not on the read surface: a destructive
    // control in a panel you open by clicking a row is one you hit by accident.
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/);

    await page.getByRole("button", { name: "Delete Recipe" }).click();

    await expect(page).toHaveURL("/recipes");
    await expect(page.getByText(recipeName)).not.toBeVisible();
  });
});

test.describe("Recipe List Features", () => {
  test("Toggle between card and table view", async ({ page, recipes }) => {
    // Create a recipe first to have something to display
    const recipeName = recipes.name("View Toggle Test");
    await recipes.create(recipeName, "Test instructions", "onion");

    // Go to recipes list
    await gotoRecipeList(page);

    // The dense table is the default: it is what the list is for, and it is
    // the view that shows total time and last-cooked side by side.
    await expect(page.getByTestId("recipe-table")).toBeVisible();
    await expect(page.getByRole("cell", { name: recipeName })).toBeVisible();

    // Click card view button
    await page.getByTestId("view-cards").click();

    // Verify URL updated and cards are shown
    await expect(page).toHaveURL(/view=cards/);
    await expect(page.getByTestId("recipe-cards")).toBeVisible();
    await expect(page.getByText(recipeName)).toBeVisible();

    // Back to the table
    await page.getByTestId("view-table").click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByTestId("recipe-table")).toBeVisible();
  });

  test("Filter recipes by tag", async ({ page, recipes }) => {
    const tag1 = recipes.tag("testtaga");
    const tag2 = recipes.tag("testtagb");
    const recipeA = recipes.name("Recipe A");
    const recipeB = recipes.name("Recipe B");

    // Create two recipes with different tags
    await recipes.createWithTag(recipeA, "Instructions A", "onion", tag1);
    await recipes.createWithTag(recipeB, "Instructions B", "garlic", tag2);

    // Go to recipes list
    await gotoRecipeList(page);

    // Both recipes should be visible
    await expect(page.getByText(recipeA)).toBeVisible();
    await expect(page.getByText(recipeB)).toBeVisible();

    // Click on first tag to filter
    await page.getByTestId(`tag-${tag1}`).click();

    // Verify URL has tags parameter
    await expect(page).toHaveURL(new RegExp(`tags=${tag1}`));

    // Only Recipe A should be visible now
    await expect(page.getByText(recipeA)).toBeVisible();
    await expect(page.getByText(recipeB)).not.toBeVisible();

    // Click the tag again to deselect
    await page.getByTestId(`tag-${tag1}`).click();

    // Both recipes should be visible again
    await expect(page.getByText(recipeA)).toBeVisible();
    await expect(page.getByText(recipeB)).toBeVisible();
  });

  /**
   * Regression: the live-search debounce must not overwrite `view`.
   *
   * The list arms a debounced `replace: true` navigation for live search. The
   * defect was that it armed one on *mount* -- before a single keystroke --
   * and built that navigation's URL from the params captured when it was
   * armed. Anything the user changed inside the window was therefore applied,
   * rendered, and then silently reverted ~300ms later to whatever the mount
   * had captured, which on a cold load is the bare `/recipes`.
   *
   * Hence the shape here: click as early as the page allows -- `gotoRecipeList`
   * returns the moment the toggle is hydrated, which is also the moment the
   * mount timer used to start running -- then wait the window out and re-read
   * the URL. The "Toggle between card and table view" test above trips over
   * the same defect, but only when the timer happens to land between its two
   * clicks, which is why it failed roughly four runs in five instead of five.
   */
  test("View toggle survives the live-search debounce window", async ({ page, recipes }) => {
    const recipeName = recipes.name("Debounce View Test");
    await recipes.create(recipeName, "Test instructions", "onion");

    await gotoRecipeList(page);

    // Click the instant the list is interactive: inside the debounce window.
    await page.getByTestId("view-table").click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByTestId("recipe-table")).toBeVisible();

    await outlastSearchDebounce(page);

    // Nothing was ever typed, so nothing was allowed to navigate: the click
    // stands, and no `search` param was invented on the user's behalf.
    await expect(page).toHaveURL(/view=table/);
    expect(new URL(page.url()).searchParams.has("search")).toBe(false);
    await expect(page.getByTestId("recipe-table")).toBeVisible();
    await expect(page.getByRole("cell", { name: recipeName })).toBeVisible();
  });

  /**
   * The same defect reached the tag chips, by the same route: one debounced
   * `replace: true` navigation carrying a stale copy of the params overwrites
   * whichever one the click had just set. Asserted on the rendered list as
   * well as the URL, because a reverted `tags` param silently puts the
   * filtered-out recipes back on screen.
   */
  test("Tag filter survives the live-search debounce window", async ({ page, recipes }) => {
    const tag = recipes.tag("debouncetag");
    const tagged = recipes.name("Debounce Tagged");
    const untagged = recipes.name("Debounce Untagged");

    await recipes.createWithTag(tagged, "Instructions tagged", "onion", tag);
    await recipes.create(untagged, "Instructions untagged", "garlic");

    await gotoRecipeList(page);

    // Again, clicked inside the window the mount used to open.
    await page.getByTestId(`tag-${tag}`).click();
    await expect(page).toHaveURL(new RegExp(`tags=${tag}`));
    await expect(page.getByText(untagged, { exact: true })).not.toBeVisible();

    await outlastSearchDebounce(page);

    await expect(page).toHaveURL(new RegExp(`tags=${tag}`));
    await expect(page.getByText(tagged, { exact: true })).toBeVisible();
    await expect(page.getByText(untagged, { exact: true })).not.toBeVisible();
  });
});

test.describe("Ingredient and Unit Comboboxes", () => {
  test("Select ingredient from combobox", async ({ page }) => {
    await gotoRecipeForm(page);

    // Click ingredient combobox
    const ingredientCombobox = page.getByTestId("ingredient-combobox").first();
    await ingredientCombobox.click();

    // Verify dropdown is open
    await expect(page.getByPlaceholder("Search or type new...")).toBeVisible();

    // Search for an ingredient
    await page.getByPlaceholder("Search or type new...").fill("onion");
    await expectComboboxFiltered(page, "onion");

    // Select the ingredient
    await page.getByPlaceholder("Search or type new...").press("ArrowDown");
    await page.getByPlaceholder("Search or type new...").press("Enter");

    // Verify the combobox shows the selected ingredient (case-insensitive)
    await expect(ingredientCombobox).toContainText(/onion/i);
  });

  test("Create new ingredient in combobox", async ({ page }) => {
    await gotoRecipeForm(page);
    const newIngredient = `CustomIngredient${Date.now()}`;

    // Click ingredient combobox
    const ingredientCombobox = page.getByTestId("ingredient-combobox").first();
    await ingredientCombobox.click();

    // Type a new ingredient name
    await page.getByPlaceholder("Search or type new...").fill(newIngredient);

    // Click "Create" option (the click waits for the filtered list to render it)
    await page.getByText(`Create "${newIngredient}"`).click();

    // Verify the combobox shows the new ingredient
    await expect(ingredientCombobox).toContainText(newIngredient);
  });

  test("Select unit from combobox", async ({ page }) => {
    await gotoRecipeForm(page);

    // First select an ingredient to enable the unit combobox row
    await addIngredient(page, "onion");

    // Click unit combobox
    const unitCombobox = page.getByTestId("unit-combobox").first();
    await unitCombobox.click();

    // Verify dropdown is open
    await expect(page.getByPlaceholder("Search or type new...")).toBeVisible();

    // Search for a unit
    await page.getByPlaceholder("Search or type new...").fill("cup");
    await expectComboboxFiltered(page, "cup");

    // Select the unit
    await page.getByPlaceholder("Search or type new...").press("ArrowDown");
    await page.getByPlaceholder("Search or type new...").press("Enter");

    // Verify the combobox shows the selected unit (might show abbreviation)
    await expect(unitCombobox).toContainText(/cup/i);
  });

  test("Add multiple ingredients to recipe", async ({ page }) => {
    await gotoRecipeForm(page);

    // Add first ingredient
    await addIngredient(page, "onion", "2", "piece");

    // Click "Add Ingredient" button
    await page.getByRole("button", { name: "Add Ingredient" }).click();

    // Add second ingredient (use the second row's comboboxes)
    const ingredientComboboxes = page.getByTestId("ingredient-combobox");
    await ingredientComboboxes.nth(1).click();

    await page.getByPlaceholder("Search or type new...").first().fill("garlic");
    await expectComboboxFiltered(page, "garlic");
    await page.getByPlaceholder("Search or type new...").first().press("ArrowDown");
    await page.getByPlaceholder("Search or type new...").first().press("Enter");

    // Verify both ingredients are selected (case-insensitive)
    await expect(ingredientComboboxes.first()).toContainText(/onion/i);
    await expect(ingredientComboboxes.nth(1)).toContainText(/garlic/i);
  });
});

test.describe("Live Search", () => {
  test("Filters as you type", async ({ page, recipes }) => {
    const recipe1 = recipes.name("LiveSearch Alpha");
    const recipe2 = recipes.name("LiveSearch Beta");

    // Create two recipes with distinct names
    await recipes.create(recipe1, "Instructions for Alpha", "onion");
    await recipes.create(recipe2, "Instructions for Beta", "garlic");

    // Go to recipes list
    await gotoRecipeList(page);

    // Both recipes should be visible initially
    await expect(page.getByText(recipe1)).toBeVisible();
    await expect(page.getByText(recipe2)).toBeVisible();

    // Type "Alpha" into search input
    await page.getByTestId("search-input").fill("Alpha");

    // Wait for the URL to update with the search parameter
    await page.waitForURL(/\?.*search=Alpha/);

    // Wait for the navigation to complete (loading state to finish)
    await page.waitForLoadState('networkidle');

    // Additionally wait for the list container to not be in loading state
    await page.waitForSelector('[aria-busy="false"]', { timeout: 5000 });

    // Only Alpha recipe should be visible
    await expect(page.getByText(recipe1)).toBeVisible();
    await expect(page.getByText(recipe2)).not.toBeVisible();
  });

  test("URL updates", async ({ page, recipes }) => {
    const recipeName = recipes.name("Search URL Test");

    // Create a recipe to search for
    await recipes.create(recipeName, "Instructions", "tomato");

    // Go to recipes list
    await gotoRecipeList(page);

    // Type a search term
    await page.getByTestId("search-input").fill("Search URL");

    // Wait for URL to update with search parameter
    await page.waitForURL(/\?.*search=Search\+URL/, { timeout: 5000 });

    // Verify URL contains search parameter
    await expect(page).toHaveURL(/\?.*search=Search\+URL/);
  });

  test("Clear restores all", async ({ page, recipes }) => {
    const recipe1 = recipes.name("Clear Test First");
    const recipe2 = recipes.name("Clear Test Second");

    // Create two recipes
    await recipes.create(recipe1, "Instructions 1", "onion");
    await recipes.create(recipe2, "Instructions 2", "garlic");

    // Go to recipes list
    await gotoRecipeList(page);

    // Type a search term that matches only one recipe
    await page.getByTestId("search-input").fill("First");

    // Wait for URL to update with search parameter
    await page.waitForURL(/\?.*search=First/, { timeout: 5000 });

    // Wait for the recipe list to update
    await page.waitForSelector('[aria-busy="false"]', { timeout: 5000 });

    // Verify only one recipe is visible
    await expect(page.getByText(recipe1)).toBeVisible();
    await expect(page.getByText(recipe2)).not.toBeVisible();

    // Clear the search input
    await page.getByTestId("search-input").fill("");

    // Wait for URL to remove search parameter (goes back to base URL)
    await page.waitForURL('/recipes', { timeout: 5000 });

    // Wait for the recipe list to update
    await page.waitForSelector('[aria-busy="false"]', { timeout: 5000 });

    // Both recipes should be visible again
    await expect(page.getByText(recipe1)).toBeVisible();
    await expect(page.getByText(recipe2)).toBeVisible();

    // URL should not contain search parameter
    await expect(page).not.toHaveURL(/search=/);
  });

  test("Works with tag filter", async ({ page, recipes }) => {
    const tag = recipes.tag("searchtag");
    const recipe1 = recipes.name("Tagged Chicken Recipe");
    const recipe2 = recipes.name("Tagged Beef Recipe");
    const recipe3 = recipes.name("Untagged Chicken Recipe");

    // Create recipes with different combinations
    await recipes.createWithTag(recipe1, "Instructions 1", "onion", tag);
    await recipes.createWithTag(recipe2, "Instructions 2", "garlic", tag);
    await recipes.create(recipe3, "Instructions 3", "tomato");

    // Go to recipes list
    await gotoRecipeList(page);

    // First, apply tag filter
    await page.getByTestId(`tag-${tag}`).click();

    // Wait for URL to update with tag parameter
    await page.waitForURL(/\?.*tags=/, { timeout: 5000 });

    // Wait for the recipe list to update
    await page.waitForSelector('[aria-busy="false"]', { timeout: 5000 });

    // Verify only tagged recipes are visible
    await expect(page.getByText(recipe1, { exact: true })).toBeVisible();
    await expect(page.getByText(recipe2, { exact: true })).toBeVisible();
    await expect(page.getByText(recipe3, { exact: true })).not.toBeVisible();

    // Now add search filter for "Chicken"
    await page.getByTestId("search-input").fill("Chicken");

    // Wait for URL to update with both parameters
    await page.waitForURL(/\?.*tags=.*search=Chicken/, { timeout: 5000 });

    // Wait for the recipe list to update
    await page.waitForSelector('[aria-busy="false"]', { timeout: 5000 });

    // Only recipe1 should be visible (has tag AND matches "Chicken")
    await expect(page.getByText(recipe1, { exact: true })).toBeVisible();
    await expect(page.getByText(recipe2, { exact: true })).not.toBeVisible();
    await expect(page.getByText(recipe3, { exact: true })).not.toBeVisible();

    // Verify URL has both parameters
    await expect(page).toHaveURL(/tags=/);
    await expect(page).toHaveURL(/search=/);
  });
});

/**
 * The planner and the cook log — the feature family the redesign was for.
 *
 * These exercise the two writes that were previously reachable only over the
 * JSON API: assigning a meal to a day, and recording that a planned meal
 * actually happened.
 */
test.describe("Meal Planning", () => {
  test("Plan a meal onto a day, then record cooking it", async ({ page, recipes }) => {
    const recipeName = recipes.name("Planner Test Recipe");
    await recipes.create(recipeName, "Planner test instructions", "onion");

    await page.goto("/plan");

    // Seven columns, always: an empty day is a slot to fill, so it has to be
    // a visible target rather than whitespace.
    await expect(page.getByTestId("week-grid")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add a meal on / })).toHaveCount(7);

    await page.getByRole("button", { name: /^Add a meal on / }).last().click();

    await page.getByTestId("plan-recipe-search").fill(recipeName);
    await page.getByRole("button", { name: recipeName, exact: true }).click();
    await page.getByTestId("plan-submit").click();

    // The meal is now in the week.
    const planned = page.getByTestId("week-grid").getByText(recipeName);
    await expect(planned).toBeVisible();

    // Record that it happened. This writes a cook AND the fulfilment linking
    // it back to the intention -- the plan item itself is not rewritten.
    await planned.click();
    await page.getByRole("button", { name: "We cooked this" }).click();

    // The intention survives being carried out...
    await expect(page.getByTestId("week-grid").getByText(recipeName)).toBeVisible();
    // ...and the fact shows up in the log.
    await page.goto("/history");
    await expect(page.getByText(recipeName)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("Remove a planned meal without erasing the cook", async ({ page, recipes }) => {
    const recipeName = recipes.name("Removal Test Recipe");
    await recipes.create(recipeName, "Removal test instructions", "garlic");

    await page.goto("/plan");
    await page.getByRole("button", { name: /^Add a meal on / }).last().click();
    await page.getByTestId("plan-recipe-search").fill(recipeName);
    await page.getByRole("button", { name: recipeName, exact: true }).click();
    await page.getByTestId("plan-submit").click();

    const planned = page.getByTestId("week-grid").getByText(recipeName);
    await expect(planned).toBeVisible();

    await planned.click();
    await page.getByRole("button", { name: "We cooked this" }).click();
    await expect(page.getByTestId("week-grid").getByText(recipeName)).toBeVisible();

    // Removing the intention leaves the fact alone: `cooks` is append-only
    // history, and `cook_fulfillments` is the only thing the delete touches.
    await page.getByTestId("week-grid").getByText(recipeName).click();
    await page.getByRole("button", { name: "Remove from the plan" }).click();
    await expect(page.getByTestId("week-grid").getByText(recipeName)).toHaveCount(0);

    await page.goto("/history");
    await expect(page.getByText(recipeName)).toBeVisible();
  });
});

test.describe("Cook Log", () => {
  test("Log a cook from the recipe drawer", async ({ page, recipes }) => {
    const recipeName = recipes.name("Cook Log Recipe");
    await recipes.create(recipeName, "Cook log instructions", "carrot");

    // The create redirect leaves the new recipe's drawer open.
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
    await expect(page.getByText("Never cooked")).toBeVisible();

    await page.getByRole("button", { name: "Log a cook" }).click();

    // Back to the same drawer, with the line the button just changed.
    await expect(page).toHaveURL(/\/recipes\?recipe=[a-f0-9-]+/);
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
    await expect(page.getByText("Never cooked")).toHaveCount(0);

    await page.goto("/history");
    await expect(page.getByText(recipeName)).toBeVisible();
  });
});
