/**
 * Playwright fixtures and UI helpers for the E2E suite.
 *
 * Isolation model: every recipe and tag the suite creates is named with a
 * marker unique to this run, the recipe's id is recorded as the browser lands
 * on its detail page, and a fixture teardown after *each test* deletes exactly
 * those rows plus the lookup rows they orphaned. Nothing is deleted by a broad
 * name pattern, and nothing is deleted through the app — see `tests/db.ts`.
 *
 * Cleaning per test rather than per run is deliberate: the combobox and recipe
 * list assertions read whatever is in the database, so each test needs to start
 * from the seeded set, not from whatever its predecessors left behind.
 */
import { randomUUID } from "node:crypto";

import { test as base, expect, type Locator, type Page } from "@playwright/test";

import {
  beginRun,
  closeDb,
  deleteRecipes,
  residueSince,
  sweepEmptyPlans,
  sweepOrphans,
  type TestRun,
} from "./db";

/**
 * Lowercase alphanumeric: this marker ends up inside tag names, a
 * `data-testid` and a URL-matching regex, none of which tolerate punctuation.
 */
const RUN_MARKER = `e2e${randomUUID().replace(/-/g, "").slice(0, 10)}`;

let nameCounter = 0;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wait for a cmdk combobox list to finish filtering, instead of sleeping.
 *
 * The list is filtered in React state from the search box's `onValueChange`, so
 * "has it re-rendered yet?" is answerable: once it has, every remaining option
 * matches what was typed. Asserting that no non-matching option is left both
 * waits for the update and rules out acting on the stale, unfiltered list —
 * which a fixed timeout could not.
 */
export async function expectComboboxFiltered(page: Page, search: string): Promise<void> {
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options.filter({ hasNotText: new RegExp(escapeRegExp(search), "i") })).toHaveCount(0);
}

/** Wait for the combobox popover to actually close, animation included. */
async function expectPopoverClosed(page: Page): Promise<void> {
  await expect(page.getByPlaceholder("Search or type new...")).toBeHidden();
}

/**
 * Pick an ingredient (and optionally a quantity and unit) in the first empty
 * ingredient row of the recipe form.
 *
 * Note the ArrowDown: cmdk pre-selects the first match as you type, so this
 * lands on the *second* option in the filtered list. The tests depend on that
 * ("tomato" filters to "canned tomatoes", "tomato", ... and ArrowDown picks
 * "tomato"), which in turn depends on the ingredient table holding exactly the
 * seeded rows — hence the per-test cleanup.
 */
export async function addIngredient(
  page: Page,
  ingredientName: string,
  quantity?: string,
  unit?: string
): Promise<void> {
  const ingredientCombobox = page.getByTestId("ingredient-combobox").first();
  await ingredientCombobox.click();

  const searchInput = page.getByPlaceholder("Search or type new...").first();
  await searchInput.fill(ingredientName);
  await expectComboboxFiltered(page, ingredientName);

  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");
  await expectPopoverClosed(page);

  if (quantity) {
    await page.getByPlaceholder("Qty").first().fill(quantity);
  }

  if (unit) {
    const unitCombobox = page.getByTestId("unit-combobox").first();
    await unitCombobox.click();

    const unitSearchInput = page.getByPlaceholder("Search or type new...").first();
    await unitSearchInput.fill(unit);
    await expectComboboxFiltered(page, unit);

    await unitSearchInput.press("ArrowDown");
    await unitSearchInput.press("Enter");
    await expectPopoverClosed(page);
  }
}

/**
 * Navigate, then wait until React has hydrated the element the test is about
 * to drive.
 *
 * The server sends the markup, but until hydration attaches the listeners a
 * click does nothing and a `fill` is worse than nothing — a controlled input
 * throws the typed value away on the first client render. Server-rendered and
 * hydrated markup are identical, so there is no user-visible state to wait
 * for; React's own fiber key on the host node is the signal that the page will
 * respond to input.
 *
 * This is what a `waitForTimeout` after `goto` would have been guessing at.
 * Waiting for the real signal is both faster and not a guess.
 */
async function gotoHydrated(page: Page, url: string, testId: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId(testId).first()).toBeVisible();
  await page.waitForFunction(
    (id) => {
      const node = document.querySelector(`[data-testid="${id}"]`);
      return !!node && Object.keys(node).some((key) => key.startsWith("__reactFiber$"));
    },
    testId,
    { timeout: 10_000 }
  );
}

/** The recipe list: its search box, tag chips and view toggle are all React-driven. */
export async function gotoRecipeList(page: Page): Promise<void> {
  await gotoHydrated(page, "/recipes", "search-input");
}

/**
 * The recipe form.
 *
 * Waits on the ingredient combobox rather than the name field: the name is an
 * uncontrolled input that accepts a `fill` before hydration, so it is not a
 * signal. The combobox is a Radix popover whose trigger is inert until
 * hydration, which is exactly the thing that used to fail — the click landed
 * on dead markup and the popover never opened.
 */
export async function gotoRecipeForm(page: Page, url = "/recipes/new"): Promise<void> {
  await gotoHydrated(page, url, "ingredient-combobox");
}

const RECIPE_ID_IN_URL = /[?&]recipe=([0-9a-f-]{36})|\/recipes\/([0-9a-f-]{36})(?:[/?#]|$)/;

/**
 * Creates recipes through the UI and remembers what it created so the fixture
 * teardown can delete precisely that.
 */
export class RecipeFactory {
  readonly createdRecipeIds: string[] = [];

  constructor(
    private readonly page: Page,
    private readonly run: TestRun
  ) {}

  /** A recipe name carrying this run's marker. Unique across the whole run. */
  name(label: string): string {
    nameCounter += 1;
    return `${label} ${this.run.marker}-${nameCounter}`;
  }

  /** A tag name carrying this run's marker. Tags are lowercased by the app. */
  tag(label: string): string {
    return `${label}${this.run.marker}`.toLowerCase();
  }

  async create(name: string, instructions: string, ingredientName = "onion"): Promise<string> {
    return this.fillAndSave({ name, instructions, ingredientName });
  }

  async createWithTag(
    name: string,
    instructions: string,
    ingredientName: string,
    tag: string
  ): Promise<string> {
    return this.fillAndSave({ name, instructions, ingredientName, tag });
  }

  private async fillAndSave(recipe: {
    name: string;
    instructions: string;
    ingredientName: string;
    tag?: string;
  }): Promise<string> {
    const { page } = this;

    await gotoRecipeForm(page);
    await page.getByLabel("Recipe Name").fill(recipe.name);

    await addIngredient(page, recipe.ingredientName, "1", "piece");

    if (recipe.tag) {
      await page.getByPlaceholder("Add a tag").fill(recipe.tag);
      await page.getByRole("button", { name: "Add", exact: true }).click();
    }

    await page.locator('textarea[name="instructions"]').fill(recipe.instructions);
    await page.getByRole("button", { name: "Save Recipe" }).click();

    // On success the action redirects to the list with the new recipe's drawer
    // open. The id in that URL is the only handle the test process gets on the
    // row the app just inserted.
    await expect(page).toHaveURL(/\/recipes\?recipe=[a-f0-9-]+/);

    const match = RECIPE_ID_IN_URL.exec(page.url());
    const id = match?.[1] ?? match?.[2];
    if (!id) throw new Error(`Could not read a recipe id out of ${page.url()}`);
    this.createdRecipeIds.push(id);

    return id;
  }
}

interface TestFixtures {
  recipes: RecipeFactory;
}

interface WorkerFixtures {
  testRun: TestRun;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  testRun: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const run = await beginRun(RUN_MARKER);

      await use(run);

      // Last line of defence: a recipe created by a test that never reached its
      // teardown, and any lookup row it orphaned.
      await deleteRecipes(run, []);
      await sweepOrphans(run);
      await sweepEmptyPlans(run);

      const residue = await residueSince(run);
      if (Object.keys(residue).length > 0) {
        // Not a failure: this database is shared, so rows created inside the
        // run window are not necessarily the suite's.
        console.warn(
          `[e2e] rows created during this run are still present: ${JSON.stringify(residue)}`
        );
      }

      await closeDb();
    },
    { scope: "worker", auto: true },
  ],

  recipes: async ({ page, testRun }, use) => {
    const factory = new RecipeFactory(page, testRun);

    await use(factory);

    // Order matters: deleting the recipes cascades their plan items away,
    // which is what can leave a plan empty for the sweep below to collect.
    await deleteRecipes(testRun, factory.createdRecipeIds);
    await sweepOrphans(testRun);
    await sweepEmptyPlans(testRun);
  },
});

export { expect, type Locator, type Page };
