import { Plus } from "lucide-react";

import { cn } from "~/lib/utils";

import type { PlannedDay, ResolvedMealPlanItem } from "./data";
import { dayOfMonth, mediumDate, relativeDay, weekdayShort } from "./format";
import { PlanItem } from "./parts";

/**
 * The seven-day planner grid.
 *
 * Every day is a column whether or not anything is planned in it: an empty
 * Wednesday is the thing you came here to fill, so it has to be a visible,
 * clickable target rather than whitespace between two full days.
 *
 * Shared by Options A and B — the grid is not where those two differ. What
 * differs is what a click DOES, which is why both handlers are injected.
 */
export function WeekGrid({
  days,
  today,
  onPickItem,
  onAddTo,
}: {
  days: PlannedDay[];
  today: string;
  onPickItem?: (item: ResolvedMealPlanItem) => void;
  onAddTo?: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">
      {days.map((day) => {
        const isToday = day.date === today;
        const isPast = day.date < today;

        return (
          <div
            key={day.date}
            className={cn(
              "bg-card flex min-h-[14rem] flex-col",
              // Past days stay legible but recede — the week reads forward.
              isPast && "bg-muted/30"
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
              {day.items.map((item) => (
                <PlanItem key={item.id} item={item} onClick={onPickItem && (() => onPickItem(item))} />
              ))}

              <button
                type="button"
                onClick={onAddTo && (() => onAddTo(day.date))}
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
 * Deliberately not framed as a score out of ten: a plan is an intention, and
 * a week where two meals became takeaway is a normal week, not a failure. The
 * number is here to answer "is the plan worth writing", not to grade anyone.
 */
export function Adherence({
  adherence,
}: {
  adherence: { planned: number; cooked: number; unfulfilled: number };
}) {
  const share = adherence.planned === 0 ? 0 : adherence.cooked / adherence.planned;

  return (
    <div className="flex items-center gap-3">
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
 * What the grid alone does not answer: which nights are still empty, and what
 * to put in them.
 *
 * A calendar shows you what IS planned. The reason a week stays half-planned
 * is that filling the gaps means remembering what you own and when you last
 * ate it — so both are here, next to the gap, rather than one navigation away.
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
  // Only dinners, and only days still ahead: a Tuesday with no dinner is a
  // decision waiting to be made, while last Tuesday is simply over.
  const gaps = days.filter(
    (day) => day.date >= today && !day.items.some((item) => item.mealSlot === "dinner")
  );

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Nights without a dinner
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">{gaps.length}</span>
        </h2>
        {gaps.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            The rest of the week is planned.
          </p>
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
        <ul className="divide-border/70 divide-y rounded-lg border">
          {suggestions.map((recipe) => (
            <li key={recipe.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="truncate text-sm">{recipe.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt, today) : "Never cooked"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
