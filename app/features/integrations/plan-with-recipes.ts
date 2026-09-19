/**
 * INTEGRATION LAYER: meal plans <-> recipes.
 *
 * The boundary rule this file serves: a feature module must work standalone
 * and may not import a sibling. `app/features/meal-plans/**` therefore holds
 * `recipeId` as a raw UUID and never joins to `recipes` -- a plan works with
 * the recipe book empty, or absent entirely. This file is permitted to import
 * from both modules; that is precisely what the integration layer is for.
 *
 * That rule has a predictable cost, and paying it once, here, is the point of
 * this file: every caller that renders a plan -- the planner UI, the agent
 * service, any export -- otherwise has to turn those raw ids into names
 * itself, and the obvious implementation is a lookup per item.
 *
 * THE CONTRACT: resolving names costs exactly ONE query, whatever the plan
 * holds. The distinct non-null ids go out in a single `= ANY($1::uuid[])` and
 * are merged in memory; a plan made only of free text issues no name query at
 * all. Reintroducing a per-item lookup here is a regression even if every
 * test still passes -- `lastCookedForRecipes` is the same shape.
 *
 * `recipeExists` says whether the id still resolves, which together with
 * `recipeId` separates the three cases a renderer cares about:
 *   * recipeId === null                -> free text ("pizza night")
 *   * recipeId set, recipeExists true  -> a live recipe, safe to link to
 *   * recipeId set, recipeExists false -> the recipe is gone
 * The last case is rarer than it looks: `meal_plan_items.recipe_id` is ON
 * DELETE CASCADE, so deleting a recipe normally takes the plan item with it.
 * It stays reachable because the plan read and the name read are two
 * statements rather than one transaction -- a recipe deleted between them
 * leaves an item in hand whose id resolves to nothing -- so it is handled
 * here instead of rendering as a blank row.
 *
 * Names are resolved LIVE, deliberately: a plan is an INTENTION, so it should
 * read as the recipe is called now. `cooks.label` does the opposite and
 * snapshots the name at log time, because history must not change under you.
 */
import { getMealPlanById } from "~/features/meal-plans/queries/meal-plans";
import type {
  MealPlanItem,
  MealPlanWithItems,
} from "~/features/meal-plans/queries/meal-plans";
import { getRecipeNamesByIds } from "~/features/recipes/queries/recipes";

/** Shown when a plan item points at a recipe that no longer resolves. */
const DELETED_RECIPE_LABEL = "Deleted recipe";

/**
 * Last-resort label. The `meal_plan_items_names_something_check` constraint
 * only rejects NULLs, so a row can still carry an empty `custom_text` and
 * name nothing at all -- render that rather than an empty cell.
 */
const UNNAMED_MEAL_LABEL = "Untitled meal";

export type ResolvedMealPlanItem = MealPlanItem & {
  /** The recipe's current name, else `customText`, else a fallback label. */
  displayName: string;
  /** Whether `recipeId` is non-null AND still points at an existing recipe. */
  recipeExists: boolean;
};

export type MealPlanWithRecipeNames = MealPlanWithItems & {
  items: ResolvedMealPlanItem[];
};

/**
 * The reusable primitive: ids in, `id -> current name` out, in ONE query.
 *
 * Deduplicates first, so a week that plans the same chili three times asks
 * about it once. Ids that match no recipe are absent from the map rather than
 * mapped to null -- `Map.get` returning undefined is the "gone" signal.
 */
export async function resolveRecipeNames(
  recipeIds: string[]
): Promise<Map<string, string>> {
  const distinctIds = [...new Set(recipeIds)];

  // No ids, no query. Worth the branch: a plan of nothing but free text is
  // normal, and it should cost the database nothing.
  if (distinctIds.length === 0) return new Map();

  return getRecipeNamesByIds(distinctIds);
}

/**
 * A meal plan with every item's `displayName` already resolved -- the shape
 * a planner view or the agent service wants, so neither has to know that
 * `recipeId` needs resolving at all.
 *
 * Costs the plan read plus exactly one name query, for any number of items.
 */
export async function getMealPlanWithRecipeNames(
  planId: string
): Promise<MealPlanWithRecipeNames | null> {
  const plan = await getMealPlanById(planId);

  if (!plan) return null;

  const recipeIds = plan.items
    .map((item) => item.recipeId)
    .filter((recipeId): recipeId is string => recipeId !== null);

  // One query for the whole plan, then a pure in-memory merge below.
  const names = await resolveRecipeNames(recipeIds);

  return {
    ...plan,
    items: plan.items.map((item) => resolveItem(item, names)),
  };
}

function resolveItem(
  item: MealPlanItem,
  names: Map<string, string>
): ResolvedMealPlanItem {
  const recipeName = item.recipeId === null ? undefined : names.get(item.recipeId);

  return {
    ...item,
    displayName: pickDisplayName(item, recipeName),
    // Absent from the map means the id resolved to nothing, so this is the
    // one place "deleted" is distinguished from "never had a recipe".
    recipeExists: recipeName !== undefined,
  };
}

/**
 * Recipe name first: an item may carry BOTH a recipe and free text ("double
 * it, half for the freezer"), and there the text is an annotation, not the
 * name of the meal. It only becomes the name when no recipe resolves.
 */
function pickDisplayName(item: MealPlanItem, recipeName: string | undefined): string {
  const name = recipeName?.trim();
  if (name) return name;

  const customText = item.customText?.trim();
  if (customText) return customText;

  return item.recipeId === null ? UNNAMED_MEAL_LABEL : DELETED_RECIPE_LABEL;
}
