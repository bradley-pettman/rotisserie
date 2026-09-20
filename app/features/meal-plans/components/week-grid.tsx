import { Plus } from "lucide-react";

import { EmptyState } from "~/components/ui/section";
import { dayOfMonth, mediumDate, relativeDay, weekdayShort } from "~/lib/date";
import { cn } from "~/lib/utils";

import type { MealSlot } from "../schemas/meal-plan";

/**
 * The minimum a planner cell needs in order to render a meal.
 *
 * Declared HERE as a shape rather than imported from the integration layer,
 * which is what keeps this module standalone: the planner renders whatever
 * already names itself, and never learns that a `recipeId` can be turned into
 * a recipe name. `ResolvedMealPlanItem` from `features/integrations/`
 * structurally satisfies this, so callers pass one straight in — without the
 * planner depending on the recipe book to compile.
 */
export interface PlannedMeal {
  id: string;
  mealSlot: MealSlot;
  plannedOn: string;
  notes: string | null;
  /** Null for a free-text meal, which the cell renders differently. */
  recipeId: string | null;
  /** Already resolved by the caller. */
  displayName: string;
}

export interface PlannedDay<M extends PlannedMeal = PlannedMeal> {
  date: string;
  meals: M[];
}

/** A single planned meal as it appears inside a day column. */
export function PlanItem({
  meal,
  onClick,
  className,
}: {
  meal: PlannedMeal;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid="plan-item"
      className={cn(
        "border-border/70 bg-card w-full rounded-lg border p-2.5 text-left transition-colors",
        onClick && "hover:border-primary/60 hover:bg-accent/40 cursor-pointer",
        // A free-text meal is not a recipe and should not look like one.
        !meal.recipeId && "border-dashed",
        className
      )}
    >
      <span className="text-muted-foreground block text-[0.65rem] font-semibold tracking-wide uppercase">
        {meal.mealSlot}
      </span>
      <span className="mt-0.5 block text-sm leading-snug font-medium">{meal.displayName}</span>
      {meal.notes && (
        <span className="text-muted-foreground mt-1 block text-xs leading-snug">{meal.notes}</span>
      )}
    </Tag>
  );
}

/**
 * The seven-day planner grid.
 *
 * Every day is a column whether or not anything is planned in it: an empty
 * Wednesday is the thing you came here to fill, so it has to be a visible,
 * clickable target rather than whitespace between two full days.
 */
export function WeekGrid<M extends PlannedMeal>({
  days,
  today,
  onPickMeal,
  onAddTo,
}: {
  days: PlannedDay<M>[];
  today: string;
  /**
   * Generic in the meal type so a caller holding richer items -- a resolved
   * plan item, say -- gets that same type back in the handler instead of
   * having to cast the structural minimum back up.
   */
  onPickMeal?: (meal: M) => void;
  onAddTo?: (date: string) => void;
}) {
  return (
    <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-xl border" data-testid="week-grid">
      {days.map((day) => {
        const isToday = day.date === today;

        return (
          <div
            key={day.date}
            data-testid={`plan-day-${day.date}`}
            className={cn(
              "bg-card flex min-h-[14rem] flex-col",
              // Past days stay legible but recede — the week reads forward.
              day.date < today && "bg-muted/30"
            )}
          >
            <div
              className={cn(
                "flex items-baseline justify-between border-b px-2.5 py-2",
                isToday && "bg-primary/15"
              )}
            >
              <span
                className={cn(
                  "text-xs font-semibold tracking-wide uppercase",
                  isToday ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {weekdayShort(day.date)}
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  isToday ? "text-foreground font-bold" : "text-muted-foreground"
                )}
              >
                {dayOfMonth(day.date)}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-1.5 p-2">
              {day.meals.map((meal) => (
                <PlanItem
                  key={meal.id}
                  meal={meal}
                  onClick={onPickMeal && (() => onPickMeal(meal))}
                />
              ))}

              <button
                type="button"
                onClick={onAddTo && (() => onAddTo(day.date))}
                aria-label={`Add a meal on ${mediumDate(day.date)}`}
                className="text-muted-foreground hover:border-primary/50 hover:text-foreground mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-xs transition-colors"
              >
                <Plus className="size-3" />
                Add
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Planned versus actually cooked.
 *
 * Deliberately not framed as a score: a plan is an intention, and a week where
 * two dinners became takeaway is a normal week, not a failure. The number
 * answers "is writing the plan worth it", not "did you comply with it".
 */
export function Adherence({
  adherence,
}: {
  adherence: { planned: number; cooked: number };
}) {
  const share = adherence.planned === 0 ? 0 : adherence.cooked / adherence.planned;

  return (
    <div className="flex items-center gap-3" data-testid="adherence">
      <div className="bg-muted h-1.5 w-28 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${share * 100}%` }} />
      </div>
      <span className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium tabular-nums">{adherence.cooked}</span>
        {" of "}
        <span className="tabular-nums">{adherence.planned}</span> cooked
      </span>
    </div>
  );
}

/**
 * What the grid alone does not answer: which nights are still empty.
 *
 * A calendar shows what IS planned. The reason a week stays half-planned is
 * that filling the gaps means remembering what you own and when you last ate
 * it, so the suggestions sit next to the gap rather than a navigation away.
 */
export function PlanGaps({
  days,
  today,
  suggestions,
  onAddTo,
}: {
  days: PlannedDay[];
  today: string;
  suggestions: { id: string; name: string; lastCookedAt?: string | null }[];
  onAddTo?: (date: string) => void;
}) {
  // Dinners only, and only days still ahead: a Tuesday with no dinner is a
  // decision waiting to be made, while last Tuesday is simply over.
  const gaps = days.filter(
    (day) => day.date >= today && !day.meals.some((meal) => meal.mealSlot === "dinner")
  );

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Nights without a dinner
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">
            {gaps.length}
          </span>
        </h2>
        {gaps.length === 0 ? (
          <EmptyState>The rest of the week is planned.</EmptyState>
        ) : (
          <ul className="divide-border/70 divide-y rounded-lg border">
            {gaps.map((day) => (
              <li key={day.date} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-sm font-medium">{mediumDate(day.date)}</span>
                <button
                  type="button"
                  onClick={onAddTo && (() => onAddTo(day.date))}
                  className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  <Plus className="size-3" />
                  Plan something
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Not had in a while</h2>
        {suggestions.length === 0 ? (
          <EmptyState>No recipes yet.</EmptyState>
        ) : (
          <ul className="divide-border/70 divide-y rounded-lg border">
            {suggestions.map((recipe) => (
              <li
                key={recipe.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <span className="truncate text-sm">{recipe.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt, today) : "Never cooked"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
