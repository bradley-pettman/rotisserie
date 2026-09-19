/**
 * E2E suite.
 *
 * Every recipe/tag here is created through the `recipes` fixture, which names
 * rows with this run's marker, records their ids and deletes exactly those rows
 * after each test (see tests/fixtures.ts and tests/db.ts). Tests therefore each
 * start from the seeded ingredients/units and no recipes of ours, which is what
 * makes the list and combobox assertions below deterministic.
 */
import { addIngredient, expect, expectComboboxFiltered, test } from "./fixtures";

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
    await page.goto("/recipes");

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
    await page.goto("/recipes");

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
    await page.goto("/recipes");

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
    await page.goto("/recipes");

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
    await page.goto("/recipes");

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
    await page.goto("/recipes");

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
