import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLoaderData } from "react-router";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import { loadLibrary, loadWeek } from "../shared/data";
import { Drawer } from "../shared/drawer";
import { dateRange, MEAL_SLOTS, mediumDate } from "../shared/format";
import { EmptyState, RecipeRow } from "../shared/parts";
import { Adherence, PlanGaps, WeekGrid } from "../shared/week";

export async function loader() {
  const [week, library] = await Promise.all([loadWeek(), loadLibrary({})]);

  return { week, recipes: library.recipes };
}

export default function OptionCPlan() {
  const { week, recipes } = useLoaderData<typeof loader>();
  const [assigning, setAssigning] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  if (!week.plan) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-7">
        <EmptyState>No plan yet.</EmptyState>
      </div>
    );
  }

  const matches = query
    ? recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.toLowerCase()))
    : recipes;

  const suggestions = [...recipes]
    .sort((left, right) => (left.lastCookedAt ?? "").localeCompare(right.lastCookedAt ?? ""))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <header className="mb-5 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{week.plan.name}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {dateRange(week.plan.startsOn, week.plan.endsOn)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {week.adherence && <Adherence adherence={week.adherence} />}
          <Button variant="outline" size="icon" aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <WeekGrid days={week.days} today={week.today} onAddTo={setAssigning} />

      <PlanGaps
        days={week.days}
        today={week.today}
        suggestions={suggestions}
        onAddTo={setAssigning}
      />

      <Drawer
        open={assigning !== null}
        onOpenChange={(open) => !open && setAssigning(null)}
        width="compact"
        title="Plan a meal"
        subtitle={assigning ? mediumDate(assigning) : undefined}
        footer={
          <>
            <Button>Add to plan</Button>
            <Button variant="ghost" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <Label className="mb-2 block">Meal</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {MEAL_SLOTS.map((slot) => (
                <Button
                  key={slot}
                  type="button"
                  size="sm"
                  variant={slot === "dinner" ? "default" : "outline"}
                  className="capitalize"
                >
                  {slot}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Recipe</Label>
            <Input
              placeholder="Search the library…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border">
              {matches.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
