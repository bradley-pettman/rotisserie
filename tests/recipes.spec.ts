import { test, expect } from "@playwright/test";

// Helper function to add an ingredient using the combobox
async function addIngredient(page: any, ingredientName: string, quantity?: string, unit?: string) {
  // Click ingredient combobox
  const ingredientCombobox = page.getByTestId("ingredient-combobox").first();
  await ingredientCombobox.click();

  // Type the ingredient name in the search input
  const searchInput = page.getByPlaceholder("Search or type new...").first();
  await searchInput.fill(ingredientName);

  // Wait for the dropdown to update
  await page.waitForTimeout(300);

  // Use keyboard navigation to select
  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");

  // Wait for the popover to close
  await page.waitForTimeout(200);

  // Fill in quantity if provided
  if (quantity) {
    await page.getByPlaceholder("Qty").first().fill(quantity);
  }

  // Select unit using the unit combobox if provided
  if (unit) {
    const unitCombobox = page.getByTestId("unit-combobox").first();
    await unitCombobox.click();

    // Type the unit in the search input
    const unitSearchInput = page.getByPlaceholder("Search or type new...").first();
    await unitSearchInput.fill(unit);

    // Wait for the dropdown to update
    await page.waitForTimeout(300);

    // Select the first match
    await unitSearchInput.press("ArrowDown");
    await unitSearchInput.press("Enter");

    // Wait for the popover to close
    await page.waitForTimeout(200);
  }
}

// Helper function to create a recipe with a tag
async function createRecipeWithTag(page: any, name: string, instructions: string, ingredientName: string, tag: string) {
  await page.goto("/recipes/new");
  await page.getByLabel("Recipe Name").fill(name);

  // Add an ingredient
  await addIngredient(page, ingredientName, "1", "piece");

  // Add a tag
  await page.getByPlaceholder("Add a tag").fill(tag);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Fill in instructions
  await page.locator('textarea[name="instructions"]').fill(instructions);

  // Click "Save Recipe"
  await page.getByRole("button", { name: "Save Recipe" }).click();

  // Wait for redirect to detail page
  await expect(page).toHaveURL(/\/recipes\/[a-f0-9-]+$/);
}

// Helper function to create a recipe
async function createRecipe(page: any, name: string, instructions: string, ingredientName = "onion") {
  await page.goto("/recipes/new");
  await page.getByLabel("Recipe Name").fill(name);

  // Add an ingredient using an existing seeded ingredient
  await addIngredient(page, ingredientName, "1", "piece");

  // Fill in instructions
  await page.locator('textarea[name="instructions"]').fill(instructions);

  // Click "Save Recipe"
  await page.getByRole("button", { name: "Save Recipe" }).click();

  // Wait for redirect to detail page
  await expect(page).toHaveURL(/\/recipes\/[a-f0-9-]+$/);
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

  test("Create a new recipe", async ({ page }) => {
    const recipeName = `Test Recipe ${Date.now()}`;
    const instructions = "Step 1: Mix ingredients\nStep 2: Cook for 20 minutes\nStep 3: Serve hot";

    // Create the recipe using our helper
    await createRecipe(page, recipeName, instructions, "garlic");

    // Verify recipe name appears on the page
    await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();
  });

  test("View recipe list and detail", async ({ page }) => {
    // First, create a recipe to ensure there's one to view
    const recipeName = `View Test Recipe ${Date.now()}`;
    const instructions = "Instructions for viewing test";

    await createRecipe(page, recipeName, instructions, "tomato");

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

  test("Edit a recipe", async ({ page }) => {
    // First, create a recipe to edit
    const originalName = `Edit Test Recipe ${Date.now()}`;
    const updatedName = `Updated ${originalName}`;
    const instructions = "Original instructions";

    await createRecipe(page, originalName, instructions, "potato");

    // Click "Edit" button
    await page.getByRole("link", { name: "Edit" }).click();

    // Wait for the edit page to load
    await expect(page).toHaveURL(/\/edit$/);

    // Verify the form is pre-populated
    await expect(page.getByLabel("Recipe Name")).toHaveValue(originalName);

    // Change the recipe name
    await page.getByLabel("Recipe Name").fill(updatedName);

    // Wait for any React state updates
    await page.waitForTimeout(300);

    // Click "Save Changes"
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Wait for navigation (the form should redirect on success)
    await page.waitForURL(/\/recipes\/[a-f0-9-]+[^\/]$/, { timeout: 15000 });

    // Verify the updated name appears on detail page
    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  });

  test("Delete a recipe", async ({ page }) => {
    // First, create a recipe to delete
    const recipeName = `Delete Test Recipe ${Date.now()}`;
    const instructions = "Instructions for delete test";

    await createRecipe(page, recipeName, instructions, "carrot");

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
  test("Toggle between card and table view", async ({ page }) => {
    // Create a recipe first to have something to display
    const recipeName = `View Toggle Test ${Date.now()}`;
    await createRecipe(page, recipeName, "Test instructions", "onion");

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

  test("Filter recipes by tag", async ({ page }) => {
    const timestamp = Date.now();
    const tag1 = `testtag${timestamp}a`;
    const tag2 = `testtag${timestamp}b`;

    // Create two recipes with different tags
    await createRecipeWithTag(
      page,
      `Recipe A ${timestamp}`,
      "Instructions A",
      "onion",
      tag1
    );

    await createRecipeWithTag(
      page,
      `Recipe B ${timestamp}`,
      "Instructions B",
      "garlic",
      tag2
    );

    // Go to recipes list
    await page.goto("/recipes");

    // Both recipes should be visible
    await expect(page.getByText(`Recipe A ${timestamp}`)).toBeVisible();
    await expect(page.getByText(`Recipe B ${timestamp}`)).toBeVisible();

    // Click on first tag to filter
    await page.getByTestId(`tag-${tag1}`).click();

    // Verify URL has tags parameter
    await expect(page).toHaveURL(new RegExp(`tags=${tag1}`));

    // Only Recipe A should be visible now
    await expect(page.getByText(`Recipe A ${timestamp}`)).toBeVisible();
    await expect(page.getByText(`Recipe B ${timestamp}`)).not.toBeVisible();

    // Click the tag again to deselect
    await page.getByTestId(`tag-${tag1}`).click();

    // Both recipes should be visible again
    await expect(page.getByText(`Recipe A ${timestamp}`)).toBeVisible();
    await expect(page.getByText(`Recipe B ${timestamp}`)).toBeVisible();
  });

  test("Test recipe cleanup panel", async ({ page }) => {
    const timestamp = Date.now();
    const testPattern = `Cleanup Test ${timestamp}`;

    // Create test recipes to clean up
    await createRecipe(page, `${testPattern} 1`, "Instructions 1", "onion");
    await createRecipe(page, `${testPattern} 2`, "Instructions 2", "garlic");
    await createRecipe(page, `Other Recipe ${timestamp}`, "Other instructions", "tomato");

    // Go to recipes list
    await page.goto("/recipes");

    // Verify all recipes are visible
    await expect(page.getByText(`${testPattern} 1`)).toBeVisible();
    await expect(page.getByText(`${testPattern} 2`)).toBeVisible();
    await expect(page.getByText(`Other Recipe ${timestamp}`)).toBeVisible();

    // Click cleanup toggle button
    await page.getByTestId("cleanup-toggle").click();

    // Verify cleanup panel is visible
    await expect(page.getByTestId("cleanup-panel")).toBeVisible();

    // Enter the pattern to delete
    await page.getByTestId("cleanup-pattern").fill(testPattern);

    // Click delete button
    await page.getByTestId("cleanup-submit").click();

    // Wait for the action to complete
    await expect(page.getByTestId("cleanup-success")).toBeVisible();

    // Verify cleanup recipes are gone but other recipe remains
    await expect(page.getByText(`${testPattern} 1`)).not.toBeVisible();
    await expect(page.getByText(`${testPattern} 2`)).not.toBeVisible();
    await expect(page.getByText(`Other Recipe ${timestamp}`)).toBeVisible();
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
    await page.waitForTimeout(300);

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
    await page.waitForTimeout(300);

    // Click "Create" option
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
    await page.waitForTimeout(300);

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
    await page.waitForTimeout(300);
    await page.getByPlaceholder("Search or type new...").first().press("ArrowDown");
    await page.getByPlaceholder("Search or type new...").first().press("Enter");

    // Verify both ingredients are selected (case-insensitive)
    await expect(ingredientComboboxes.first()).toContainText(/onion/i);
    await expect(ingredientComboboxes.nth(1)).toContainText(/garlic/i);
  });
});
