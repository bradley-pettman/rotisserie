import { useState } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useLoaderData } from "react-router";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import { PageHeader } from "./layout";
import { loadLibrary, loadWeek } from "../shared/data";
import type { ResolvedMealPlanItem } from "../shared/data";
import { Drawer } from "../shared/drawer";
import { dateRange, MEAL_SLOTS, mediumDate, relativeDay, titleCase } from "../shared/format";
import { EmptyState, RecipeRow, SectionHeading } from "../shared/parts";
import { Adherence, PlanGaps, WeekGrid } from "../shared/week";

export async function loader() {
  const [week, library] = await Promise.all([loadWeek(), loadLibrary({})]);

  return { week, recipes: library.recipes };
}

/** What the drawer is currently doing. `null` closes it. */
type DrawerState =
  | { mode: "assign"; date: string }
  | { mode: "item"; item: ResolvedMealPlanItem }
  | null;

export default function OptionAPlan() {
  const { week, recipes } = useLoaderData<typeof loader>();
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [slot, setSlot] = useState<string>("dinner");
  const [query, setQuery] = useState("");

  const matches = query
    ? recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.toLowerCase()))
    : recipes;

  // Longest since a cook first, never-cooked before everything. Sorted here
  // rather than in SQL because the list is already loaded for the picker.
  const suggestions = [...recipes]
    .sort((left, right) => (left.lastCookedAt ?? "").localeCompare(right.lastCookedAt ?? ""))
    .slice(0, 5);

  if (!week.plan) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-7">
        <PageHeader title="Plan" />
        <EmptyState>No plan yet. Start one for this week.</EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <PageHeader
        title={week.plan.name}
        subtitle={dateRange(week.plan.startsOn, week.plan.endsOn)}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next week">
              <ChevronRight className="size-4" />
            </Button>
          </>
        }
      />

      {week.adherence && (
        <div className="mb-5">
          <Adherence adherence={week.adherence} />
        </div>
      )}

      <WeekGrid
        days={week.days}
        today={week.today}
        onPickItem={(item) => setDrawer({ mode: "item", item })}
        onAddTo={(date) => {
          setQuery("");
          setDrawer({ mode: "assign", date });
        }}
      />

      <PlanGaps
        days={week.days}
        today={week.today}
        suggestions={suggestions}
        onAddTo={(date) => {
          setQuery("");
          setDrawer({ mode: "assign", date });
        }}
      />

      {/*
        One drawer, two jobs — assigning a meal to an empty slot and inspecting
        one that is already there. Both are small enough that a page would be
        an over-reaction, and both want the week still visible behind them.
      */}
      <Drawer
        open={drawer !== null}
        onOpenChange={(open) => !open && setDrawer(null)}
        width="compact"
        title={drawer?.mode === "assign" ? "Plan a meal" : (drawer?.item.displayName ?? "")}
        subtitle={
          drawer?.mode === "assign"
            ? mediumDate(drawer.date)
            : drawer
              ? `${titleCase(drawer.item.mealSlot)} · ${mediumDate(drawer.item.plannedOn)}`
              : undefined
        }
        footer={
          drawer?.mode === "assign" ? (
            <>
              <Button className="gap-2">
                <CalendarPlus className="size-4" />
                Add to plan
              </Button>
              <Button variant="ghost" onClick={() => setDrawer(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button className="gap-2">
                <Check className="size-4" />
                Mark as cooked
              </Button>
              <Button variant="ghost">Remove</Button>
            </>
          )
        }
      >
        {drawer?.mode === "assign" && (
          <div className="space-y-6">
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
                  autoFocus
                  placeholder="Search the library…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border">
                {matches.map((recipe) => (
                  <RecipeRow key={recipe.id} recipe={recipe} />
                ))}
              </div>
            </div>
          </div>
        )}

        {drawer?.mode === "item" && (
          <div className="space-y-6">
            {drawer.item.notes && (
              <section>
                <SectionHeading>Note</SectionHeading>
                <p className="bg-muted/50 rounded-lg p-3 text-sm">{drawer.item.notes}</p>
              </section>
            )}

            <section>
              <SectionHeading>Planned for</SectionHeading>
              <p className="text-sm">
                {mediumDate(drawer.item.plannedOn)}
                <span className="text-muted-foreground">
                  {" · "}
                  {relativeDay(drawer.item.plannedOn, week.today)}
                </span>
              </p>
            </section>

            {!drawer.item.recipeId && (
              <p className="text-muted-foreground text-sm">
                A free-text meal — not linked to a recipe.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
