import { test, expect } from "@playwright/test";

// Helper function to add an ingredient using the combobox
async function addIngredient(page: any, ingredientName: string, quantity?: string, unit?: string) {
  // Get all comboboxes - first is ingredient, second is unit
  const comboboxes = page.getByRole("combobox");

  // Click ingredient combobox (first one)
  await comboboxes.first().click();

  // Type the ingredient name in the search input
  const searchInput = page.getByPlaceholder("Search or type new...").first();
  await searchInput.fill(ingredientName);

  // Wait for the dropdown to update
  await page.waitForTimeout(300);

  // Use keyboard navigation to select - press Enter to select the first item
  // or press down arrow and enter to select
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
    // Click unit combobox (second combobox in the first ingredient row)
    const unitCombobox = comboboxes.nth(1);
    await unitCombobox.click();

    // Type the unit in the search input
    const unitSearchInput = page.getByPlaceholder("Search or type new...").first();
    await unitSearchInput.fill(unit);

    // Wait for the dropdown to update
    await page.waitForTimeout(300);

    // Select the first match or create custom unit
    await unitSearchInput.press("ArrowDown");
    await unitSearchInput.press("Enter");

    // Wait for the popover to close
    await page.waitForTimeout(200);
  }
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
    await expect(page.getByText("tomato")).toBeVisible();
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
