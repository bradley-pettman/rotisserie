import { useState } from "react";
import { CalendarPlus, Check, Search, Trash2 } from "lucide-react";
import { Form, Link, redirect, useLoaderData } from "react-router";

import { PageHeader } from "~/components/app-shell";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  getPlanAdherence,
  logCookFulfillingPlanItem,
} from "~/features/integrations/plan-to-cook";
import type { ResolvedMealPlanItem } from "~/features/integrations/plan-with-recipes";
import { getMealPlanWithRecipeNames } from "~/features/integrations/plan-with-recipes";
import type { PlannedDay } from "~/features/meal-plans/components/week-grid";
import { Adherence, PlanGaps, WeekGrid } from "~/features/meal-plans/components/week-grid";
import {
  assignMeal,
  createMealPlan,
  findPlanCovering,
  getMealPlanItem,
  removeMealPlanItem,
} from "~/features/meal-plans/queries/meal-plans";
import { mealPlanItemSchema } from "~/features/meal-plans/schemas/meal-plan";
import { getRecipeById, listRecipes } from "~/features/recipes/queries/recipes";
import { createCookSchema } from "~/features/recipes/schemas/cook";
import {
  addDays,
  dateRange,
  MEAL_SLOTS,
  mediumDate,
  startOfWeek,
  titleCase,
  todayIso,
} from "~/lib/date";
import { cn } from "~/lib/utils";

import type { Route } from "./+types/plan";

/**
 * The weekly planner.
 *
 * Lives in `app/routes/` rather than inside `features/meal-plans/` because it
 * resolves plan items' recipe names, which reaches across two feature modules.
 * The module boundary rule (CLAUDE.md) keeps that kind of code out of either
 * module and in the integration layer or its callers -- the same reason the
 * cross-module API routes live out here.
 *
 * Names are resolved live, in one batched query, via
 * `getMealPlanWithRecipeNames`. Never `getRecipeById` per item.
 */
export async function loader() {
  const today = todayIso();
  const startsOn = startOfWeek(today);
  const endsOn = addDays(startsOn, 6);

  const [plan, recipes] = await Promise.all([
    findPlanCovering(today),
    listRecipes({}, { includeLastCookedAt: true }),
  ]);

  // No plan for this week yet is a normal state, not an error: the grid still
  // renders seven empty days, and assigning the first meal creates the plan.
  const [resolved, adherence] = plan
    ? await Promise.all([getMealPlanWithRecipeNames(plan.id), getPlanAdherence(plan.id)])
    : [null, null];

  // Annotated: MealPlanWithRecipeNames intersects the base plan's `items`, so
  // `.filter()` below resolves to the UNRESOLVED element type without it.
  const meals: ResolvedMealPlanItem[] = resolved?.items ?? [];

  const days: PlannedDay<ResolvedMealPlanItem>[] = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(startsOn, offset);
    return { date, meals: meals.filter((meal) => meal.plannedOn === date) };
  });

  return { plan, days, adherence, today, startsOn, endsOn, recipes };
}

/**
 * The plan covering `day`, created if there is none.
 *
 * Assigning a meal to a week nobody has started is the common first action, so
 * it must not require the user to create a plan first. Weeks run Sunday to
 * Saturday, matching the grid.
 */
async function planCovering(day: string) {
  const existing = await findPlanCovering(day);
  if (existing) return existing;

  const startsOn = startOfWeek(day);

  return createMealPlan({
    name: `Week of ${mediumDate(startsOn).replace(/^\w+, /, "")}`,
    startsOn,
    endsOn: addDays(startsOn, 6),
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "assign") {
    const plannedOn = String(formData.get("plannedOn"));
    const recipeId = formData.get("recipeId");

    const parsed = mealPlanItemSchema.safeParse({
      recipeId: recipeId ? String(recipeId) : null,
      customText: (formData.get("customText") as string) || null,
      plannedOn,
      mealSlot: formData.get("mealSlot"),
    });

    if (!parsed.success) {
      throw new Response("Could not plan that meal", { status: 400 });
    }

    const plan = await planCovering(plannedOn);
    await assignMeal(plan.id, parsed.data);

    return redirect("/plan");
  }

  if (intent === "remove") {
    await removeMealPlanItem(String(formData.get("itemId")));
    return redirect("/plan");
  }

  /**
   * Marking a planned meal cooked writes TWO rows, and the pair is the point.
   *
   * The cook is an append-only fact with its own date and its own snapshotted
   * label; the fulfilment is the link back to the intention. Neither replaces
   * the other -- the plan item stays exactly as it was, because a plan that
   * was carried out is not a plan that has been edited.
   */
  if (intent === "cooked") {
    const item = await getMealPlanItem(String(formData.get("itemId")));

    if (!item) throw new Response("Meal plan item not found", { status: 404 });

    // The label snapshots whatever the meal is called right now: the recipe's
    // current name, or the free text the item carries.
    const recipe = item.recipeId ? await getRecipeById(item.recipeId) : null;
    const label = recipe?.name ?? item.customText ?? "Untitled meal";

    const parsed = createCookSchema.safeParse({
      recipeId: item.recipeId,
      label,
      // Today, not `item.plannedOn`: you are recording that it happened now.
      // The two dates are independent by design, and a Tuesday plan cooked on
      // Wednesday is a fully-recorded outcome, not a discrepancy.
      cookedOn: todayIso(),
      mealSlot: item.mealSlot,
      servingsMade: recipe?.servings ?? null,
      notes: null,
    });

    if (!parsed.success) throw new Response("Could not log this cook", { status: 400 });

    // One transaction: the cook and the link back to the plan item it fulfils
    // commit together or not at all. Written separately, a plan item removed in
    // another tab between the two left a committed cook with no fulfilment --
    // the meal still read as uncooked, adherence undercounted it forever, and
    // clicking again appended a second cook to append-only history.
    const cook = await logCookFulfillingPlanItem(parsed.data, item.id);

    if (!cook) throw new Response("Recipe not found", { status: 404 });

    return redirect("/plan");
  }

  return null;
}

/** What the drawer is doing. `null` closes it. */
type DrawerState =
  | { mode: "assign"; date: string }
  | { mode: "meal"; meal: ResolvedMealPlanItem }
  | null;

export default function PlanPage() {
  const { plan, days, adherence, today, startsOn, endsOn, recipes } =
    useLoaderData<typeof loader>();
  const [drawer, setDrawer] = useState<DrawerState>(null);

  // Longest since a cook first, never-cooked before everything. Sorted here
  // because the list is already loaded for the picker.
  const suggestions = [...recipes]
    .sort((left, right) => (left.lastCookedAt ?? "").localeCompare(right.lastCookedAt ?? ""))
    .slice(0, 5);

  const close = () => setDrawer(null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-7">
      <PageHeader
        title={plan?.name ?? "This week"}
        subtitle={dateRange(startsOn, endsOn)}
        actions={adherence ? <Adherence adherence={adherence} /> : undefined}
      />

      <WeekGrid
        days={days}
        today={today}
        onPickMeal={(meal) => setDrawer({ mode: "meal", meal })}
        onAddTo={(date) => setDrawer({ mode: "assign", date })}
      />

      <PlanGaps
        days={days}
        today={today}
        suggestions={suggestions}
        onAddTo={(date) => setDrawer({ mode: "assign", date })}
      />

      {/* One drawer, two jobs: filling an empty slot, and acting on a meal
          already in it. Both are single decisions made against the week, and
          both want the week still visible behind them. */}
      <Drawer
        open={drawer !== null}
        onOpenChange={(open) => !open && close()}
        width="compact"
        title={drawer?.mode === "meal" ? drawer.meal.displayName : "Plan a meal"}
        subtitle={
          drawer === null
            ? undefined
            : drawer.mode === "assign"
              ? mediumDate(drawer.date)
              : `${titleCase(drawer.meal.mealSlot)} · ${mediumDate(drawer.meal.plannedOn)}`
        }
      >
        {drawer?.mode === "assign" && (
          <AssignMealForm date={drawer.date} recipes={recipes} onDone={close} />
        )}
        {drawer?.mode === "meal" && <MealActions meal={drawer.meal} onDone={close} />}
      </Drawer>
    </div>
  );
}

/**
 * The two things you do to a meal that is already planned.
 *
 * "Cooked" writes a cook AND a fulfilment; "Remove" deletes the intention and
 * leaves any cook already recorded against it alone. Neither edits the plan
 * item, because carrying out a plan is not the same as changing it.
 */
function MealActions({
  meal,
  onDone,
}: {
  meal: ResolvedMealPlanItem;
  onDone: () => void;
}) {
  return (
    <div className="space-y-6">
      {meal.notes && (
        <p className="bg-muted/50 rounded-lg p-3 text-sm leading-relaxed">{meal.notes}</p>
      )}

      {!meal.recipeId && (
        <p className="text-muted-foreground text-sm">
          A free-text meal — not linked to a recipe.
        </p>
      )}

      {meal.recipeId && meal.recipeExists && (
        <Link
          to={`/recipes?recipe=${meal.recipeId}`}
          className="text-primary inline-flex text-sm font-medium hover:underline"
        >
          See the recipe
        </Link>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Form method="post" onSubmit={onDone}>
          <input type="hidden" name="intent" value="cooked" />
          <input type="hidden" name="itemId" value={meal.id} />
          <Button type="submit" className="w-full gap-2">
            <Check className="size-4" />
            We cooked this
          </Button>
        </Form>

        <Form method="post" onSubmit={onDone}>
          <input type="hidden" name="intent" value="remove" />
          <input type="hidden" name="itemId" value={meal.id} />
          <Button type="submit" variant="ghost" className="w-full gap-2">
            <Trash2 className="size-4" />
            Remove from the plan
          </Button>
        </Form>
      </div>
    </div>
  );
}

/**
 * Filling an empty slot.
 *
 * A plan item needs a recipe OR free text — "pizza night" is a legitimate
 * plan, and the planner is built to work with no recipe book at all — so both
 * are offered and the schema enforces that one of them is present.
 */
function AssignMealForm({
  date,
  recipes,
  onDone,
}: {
  date: string;
  recipes: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [slot, setSlot] = useState("dinner");
  const [query, setQuery] = useState("");
  const [recipeId, setRecipeId] = useState<string | null>(null);

  const matches = query
    ? recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.toLowerCase()))
    : recipes;

  return (
    <Form method="post" className="space-y-6" onSubmit={onDone}>
      <input type="hidden" name="intent" value="assign" />
      <input type="hidden" name="plannedOn" value={date} />
      <input type="hidden" name="mealSlot" value={slot} />
      {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}

      <div>
        <Label className="mb-2 block">Meal</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {MEAL_SLOTS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={slot === option ? "default" : "outline"}
              onClick={() => setSlot(option)}
              className="capitalize"
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Recipe</Label>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search the library…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            data-testid="plan-recipe-search"
          />
        </div>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border">
          {matches.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">No matches.</p>
          ) : (
            matches.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => setRecipeId(recipeId === recipe.id ? null : recipe.id)}
                data-testid={`plan-pick-${recipe.id}`}
                className={cn(
                  "block w-full border-b px-4 py-2.5 text-left text-sm last:border-b-0",
                  recipeId === recipe.id ? "bg-accent/60 font-medium" : "hover:bg-muted/50"
                )}
              >
                {recipe.name}
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="customText" className="mb-2 block">
          …or just write it down
        </Label>
        <Input
          id="customText"
          name="customText"
          placeholder="Takeaway, leftovers, pizza night…"
        />
      </div>

      <Button type="submit" className="w-full gap-2" data-testid="plan-submit">
        <CalendarPlus className="size-4" />
        Add to plan
      </Button>
    </Form>
  );
}
