/**
 * E2E suite.
 *
 * Every recipe/tag here is created through the `recipes` fixture, which names
 * rows with this run's marker, records their ids and deletes exactly those rows
 * after each test (see tests/fixtures.ts and tests/db.ts). Tests therefore each
 * start from the seeded ingredients/units and no recipes of ours, which is what
 * makes the list and combobox assertions below deterministic.
 */
import { addIngredient, expect, expectComboboxFiltered, gotoRecipeList, test, type Page } from "./fixtures";

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
  test("Home page loads and has navigation links", async ({ page }) => {
    // Visit home page
    await page.goto("/");

    // Verify "Rotisserie" heading exists
    await expect(page.getByRole("heading", { name: "Rotisserie" })).toBeVisible();

    // Verify "View Recipes" and "Add Recipe" buttons exist
    const viewRecipesButton = page.getByRole("link", { name: "View Recipes" });
    const addRecipeButton = page.getByRole("link", { name: "Add Recipe" });

    await expect(viewRecipesButton).toBeVisible();
    await expect(addRecipeButton).toBeVisible();

    // Click "View Recipes" and verify navigation to /recipes
    await viewRecipesButton.click();
    await expect(page).toHaveURL("/recipes");
  });

  test("Create a new recipe", async ({ page, recipes }) => {
    const recipeName = recipes.name("Test Recipe");
    const instructions = "Step 1: Mix ingredients\nStep 2: Cook for 20 minutes\nStep 3: Serve hot";

    // Create the recipe using our helper
    await recipes.create(recipeName, instructions, "garlic");

    // Verify recipe name appears on the page
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
  });

  test("View recipe list and detail", async ({ page, recipes }) => {
    // First, create a recipe to ensure there's one to view
    const recipeName = recipes.name("View Test Recipe");
    const instructions = "Instructions for viewing test";

    await recipes.create(recipeName, instructions, "tomato");

    // Visit /recipes
    await page.goto("/recipes");

    // Click on the recipe card
    await page.getByText(recipeName).click();

    // Verify the detail page shows the recipe name, ingredients, instructions
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Ingredients" })).toBeVisible();
    await expect(page.getByText("Tomato")).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Instructions" })).toBeVisible();
    await expect(page.getByText(instructions)).toBeVisible();
  });

  test("Edit a recipe", async ({ page, recipes }) => {
    // First, create a recipe to edit
    const originalName = recipes.name("Edit Test Recipe");
    const updatedName = `Updated ${originalName}`;
    const instructions = "Original instructions";

    await recipes.create(originalName, instructions, "potato");

    // Click "Edit" button
    await page.getByRole("link", { name: "Edit" }).click();

    // Wait for the edit page to load
    await expect(page).toHaveURL(/\/edit$/);

    // Verify the form is pre-populated
    await expect(page.getByLabel("Recipe Name")).toHaveValue(originalName);

    // Change the recipe name
    await page.getByLabel("Recipe Name").fill(updatedName);
    await expect(page.getByLabel("Recipe Name")).toHaveValue(updatedName);

    // Click "Save Changes"
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Wait for navigation (the form should redirect on success)
    await page.waitForURL(/\/recipes\/[a-f0-9-]+[^\/]$/, { timeout: 15000 });

    // Verify the updated name appears on detail page
    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  });

  test("Delete a recipe", async ({ page, recipes }) => {
    // First, create a recipe to delete
    const recipeName = recipes.name("Delete Test Recipe");
    const instructions = "Instructions for delete test";

    await recipes.create(recipeName, instructions, "carrot");

    // Handle the confirmation dialog
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Click "Delete Recipe" button
    await page.getByRole("button", { name: "Delete Recipe" }).click();

    // Verify redirect to /recipes
    await expect(page).toHaveURL("/recipes");

    // Verify the recipe no longer appears in the list
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

    // Verify card view is default (cards container should be visible)
    await expect(page.getByTestId("recipe-cards")).toBeVisible();

    // Click table view button
    await page.getByTestId("view-table").click();

    // Verify URL updated and table is shown
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByTestId("recipe-table")).toBeVisible();

    // Verify recipe is in table
    await expect(page.getByRole("cell", { name: recipeName })).toBeVisible();

    // Click card view button
    await page.getByTestId("view-cards").click();

    // Verify URL updated and cards are shown
    await expect(page).toHaveURL(/view=cards/);
    await expect(page.getByTestId("recipe-cards")).toBeVisible();
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
    await page.goto("/recipes/new");

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
    await page.goto("/recipes/new");
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
    await page.goto("/recipes/new");

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
    await page.goto("/recipes/new");

    // Add first ingredient
    await addIngredient(page, "onion", "2", "piece");

    // Click "Add Ingredient" button
    await page.getByRole("button", { name: "+ Add Ingredient" }).click();

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
