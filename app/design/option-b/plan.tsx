import { useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useLoaderData } from "react-router";

import { Button } from "~/components/ui/button";

import { loadLibrary, loadWeek } from "../shared/data";
import { dateRange, mediumDate, relativeDay, titleCase } from "../shared/format";
import { EmptyState, RecipeRow } from "../shared/parts";
import { Adherence, WeekGrid } from "../shared/week";

export async function loader() {
  const [week, library] = await Promise.all([loadWeek(), loadLibrary({})]);

  return { week, recipes: library.recipes };
}

export default function OptionBPlan() {
  const { week, recipes } = useLoaderData<typeof loader>();
  const [selectedDate, setSelectedDate] = useState(week.today);

  if (!week.plan) {
    return (
      <div className="p-8">
        <EmptyState>No plan yet.</EmptyState>
      </div>
    );
  }

  const day = week.days.find((candidate) => candidate.date === selectedDate) ?? week.days[0];

  const suggestions = [...recipes]
    .sort((left, right) => (left.lastCookedAt ?? "").localeCompare(right.lastCookedAt ?? ""))
    .slice(0, 6);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-h-0 overflow-y-auto px-7 py-6">
        <div className="mb-5 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{week.plan.name}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {dateRange(week.plan.startsOn, week.plan.endsOn)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {week.adherence && <Adherence adherence={week.adherence} />}
            <Button variant="outline" size="icon" aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next week">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Selecting a day fills the pane on the right rather than opening
            anything — the same bet the recipe view makes. */}
        <WeekGrid
          days={week.days}
          today={week.today}
          onPickItem={(item) => setSelectedDate(item.plannedOn)}
          onAddTo={setSelectedDate}
        />
      </div>

      <aside className="flex min-h-0 flex-col overflow-y-auto border-l">
        <header className="bg-muted/30 border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground size-4" />
            <h2 className="text-sm font-semibold">{mediumDate(day.date)}</h2>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {relativeDay(day.date, week.today)} · {day.items.length}{" "}
            {day.items.length === 1 ? "meal" : "meals"} planned
          </p>
        </header>

        <div className="space-y-2 p-4">
          {day.items.length === 0 ? (
            <EmptyState>Nothing planned.</EmptyState>
          ) : (
            day.items.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-muted-foreground text-[0.65rem] font-semibold tracking-wide uppercase">
                      {titleCase(item.mealSlot)}
                    </span>
                    <p className="text-sm font-medium">{item.displayName}</p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon-xs" aria-label="Mark cooked">
                      <Check className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Remove">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {item.notes && (
                  <p className="text-muted-foreground mt-1.5 text-xs">{item.notes}</p>
                )}
              </div>
            ))
          )}

          <Button variant="outline" size="sm" className="w-full gap-1.5">
            <Plus className="size-3.5" />
            Add a meal
          </Button>
        </div>

        <div className="border-t px-4 py-4">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
            Not had in a while
          </h3>
          <div className="overflow-hidden rounded-lg border">
            {suggestions.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
