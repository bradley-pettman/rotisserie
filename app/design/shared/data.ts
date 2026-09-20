/**
 * Loader data for the three design prototypes.
 *
 * All three options render the SAME data — the proposals differ in layout and
 * interaction, not in what the app knows. Sharing one data module is what
 * makes them comparable, and it keeps the cross-module rules in one place:
 * plan items resolve their recipe names through `integrations/`, never by
 * calling `getRecipeById` per item.
 */
import { getPlanAdherence } from "~/features/integrations/plan-to-cook";
import type { ResolvedMealPlanItem } from "~/features/integrations/plan-with-recipes";
import { getMealPlanWithRecipeNames } from "~/features/integrations/plan-with-recipes";
import { listMealPlans } from "~/features/meal-plans/queries/meal-plans";
import { getCookingHistory, lastCookedAt } from "~/features/recipes/queries/cooks";
import type { Cook } from "~/features/recipes/queries/cooks";
import type { RecipeListItem, RecipeWithDetails } from "~/features/recipes/queries/recipes";
import { getAllTags, getRecipeById, listRecipes } from "~/features/recipes/queries/recipes";

import { addDays, todayIso } from "./format";

export type { Cook, RecipeListItem, RecipeWithDetails, ResolvedMealPlanItem };

/**
 * A recipe with the one fact the recipe row itself does not carry: when it
 * was last actually cooked. Every design surfaces it next to the title,
 * because "we had this on Tuesday" is what decides whether to plan it again.
 */
export type RecipeDetail = RecipeWithDetails & { lastCookedAt: string | null };

export interface RecipeFilters {
  search?: string;
  tags?: string[];
}

/** `?search=` and `?tags=a,b` off a request URL, in the existing list's spelling. */
export function readFilters(request: Request): RecipeFilters {
  const params = new URL(request.url).searchParams;
  const search = params.get("search") || undefined;
  const tags = params.get("tags")?.split(",").filter(Boolean);

  return { search, tags: tags?.length ? tags : undefined };
}

/**
 * The recipe library plus the tag vocabulary it is filtered on.
 *
 * `includeLastCookedAt` is on because every one of the three designs surfaces
 * "when did we last have this" in the list itself — it is the field that turns
 * a recipe box into a planning tool, and it costs one extra batched query for
 * the whole page rather than one per row.
 */
export async function loadLibrary(filters: RecipeFilters) {
  const [recipes, tags] = await Promise.all([
    listRecipes(filters, { includeLastCookedAt: true }),
    getAllTags(),
  ]);

  return { recipes, tags, filters };
}

export async function loadRecipe(id: string): Promise<RecipeDetail | null> {
  const recipe = await getRecipeById(id);
  if (!recipe) return null;

  return { ...recipe, lastCookedAt: await lastCookedAt(id) };
}

/**
 * Optionally load a recipe named by `?recipe=<id>`.
 *
 * The drawer designs keep the open panel in the URL rather than in component
 * state, so a drawer is linkable, survives a reload, and closes on Back. A
 * stale or deleted id resolves to null and the drawer simply does not open —
 * a dead link should not 404 the page behind it.
 */
export async function loadDrawerRecipe(request: Request): Promise<RecipeDetail | null> {
  const id = new URL(request.url).searchParams.get("recipe");
  if (!id) return null;

  return loadRecipe(id);
}

export interface PlannedDay {
  date: string;
  items: ResolvedMealPlanItem[];
}

/**
 * The week containing `today`, its items grouped by day, and how much of it
 * actually got cooked.
 *
 * Falls back to the most recent plan when no plan covers today, so the planner
 * views have something to render before the first plan of the week exists.
 * Returns `plan: null` only when there are no plans at all.
 */
export async function loadWeek(anchor = todayIso()) {
  const plans = await listMealPlans();

  const covering = plans.find(
    (plan) => plan.startsOn <= anchor && plan.endsOn >= anchor
  );
  const plan = covering ?? plans[0] ?? null;

  if (!plan) {
    return { plan: null, days: [] as PlannedDay[], adherence: null, today: anchor };
  }

  const [resolved, adherence] = await Promise.all([
    getMealPlanWithRecipeNames(plan.id),
    getPlanAdherence(plan.id),
  ]);

  // Annotated: MealPlanWithRecipeNames intersects the base plan's `items`,
  // so `.filter()` below resolves to the UNRESOLVED element type without it.
  const items: ResolvedMealPlanItem[] = resolved?.items ?? [];
  const start = plan.startsOn;

  // Seven days always, in order, whether or not anything is planned in them —
  // an empty Wednesday is a slot to fill, and it has to be visible to be
  // clickable. Grouping here rather than in the component keeps every option's
  // grid reading from the same shape.
  const days: PlannedDay[] = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    return { date, items: items.filter((item) => item.plannedOn === date) };
  });

  return { plan: { ...plan, name: plan.name ?? "This week" }, days, adherence, today: anchor };
}

/** Recent cooks — the append-only record of what was actually made. */
export async function loadHistory(days = 30): Promise<Cook[]> {
  return getCookingHistory(days);
}

/**
 * Everything the "today" surface needs: tonight's plan, the rest of the week,
 * what was cooked lately, and the recipes gone longest without a cook.
 */
export async function loadToday() {
  const [week, history, library] = await Promise.all([
    loadWeek(),
    loadHistory(14),
    loadLibrary({}),
  ]);

  const today = todayIso();
  const todayItems = week.days.find((day) => day.date === today)?.items ?? [];

  // Tonight's dinner is the one thing this surface is FOR, so it is loaded in
  // full — times, servings, ingredients — rather than as a name the reader has
  // to click to make useful. A free-text dinner ("takeaway") has no recipe to
  // load, and that is a normal answer, not a missing one.
  const dinnerId = todayItems.find((item) => item.mealSlot === "dinner")?.recipeId ?? null;
  const tonight = dinnerId ? await loadRecipe(dinnerId) : null;

  // "Not had in a while" ranks never-cooked first, then oldest cook. Recipes
  // are the only input, so a recipe cooked outside any plan still counts.
  const neglected = [...library.recipes]
    .sort((left, right) => {
      const leftDay = left.lastCookedAt ?? "";
      const rightDay = right.lastCookedAt ?? "";
      return leftDay.localeCompare(rightDay);
    })
    .slice(0, 5);

  return { week, history, recipes: library.recipes, todayItems, tonight, neglected, today };
}
