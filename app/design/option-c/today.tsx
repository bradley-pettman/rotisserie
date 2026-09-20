import { ArrowRight, Clock, Flame, Repeat, UtensilsCrossed, Users } from "lucide-react";
import { Link, useLoaderData, useSearchParams } from "react-router";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { capitalizeIngredientName } from "~/features/recipes/lib/display-name";

import { loadDrawerRecipe, loadToday } from "../shared/data";
import { Drawer } from "../shared/drawer";
import {
  dayOfMonth,
  duration,
  mediumDate,
  relativeDay,
  totalTime,
  weekdayShort,
} from "../shared/format";
import { CookRow, EmptyState, RecipeMeta, SectionHeading } from "../shared/parts";
import { RecipeBody } from "../shared/recipe-body";
import type { Route } from "./+types/today";

export async function loader({ request }: Route.LoaderArgs) {
  const [today, drawerRecipe] = await Promise.all([loadToday(), loadDrawerRecipe(request)]);

  return { ...today, drawerRecipe };
}

export default function OptionCToday() {
  const { week, history, todayItems, tonight, neglected, today, drawerRecipe } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const openRecipe = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("recipe", id);
    else next.delete("recipe");
    setSearchParams(next, { preventScrollReset: true });
  };

  const dinner = todayItems.find((item) => item.mealSlot === "dinner");
  const otherMeals = todayItems.filter((item) => item.mealSlot !== "dinner");
  const restOfWeek = week.days.filter((day) => day.date > today);

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <header className="mb-7">
        <p className="text-muted-foreground text-sm">{mediumDate(today)}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Tonight</h1>
      </header>

      {/*
        The hero answers the one question the app exists for, before any list
        does. Everything below it is context for that answer.
      */}
      {dinner ? (
        <section className="from-primary/12 border-primary/25 mb-8 rounded-2xl border bg-gradient-to-br to-transparent p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Dinner
              </span>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">{dinner.displayName}</h2>
              {tonight && (
                <RecipeMeta recipe={tonight} className="mt-3" />
              )}
              {dinner.notes && (
                <p className="text-muted-foreground mt-2 text-sm">{dinner.notes}</p>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              <Button size="lg" className="gap-2">
                <UtensilsCrossed className="size-4" />
                Start cooking
              </Button>
              <Button size="lg" variant="outline" className="gap-2">
                <Repeat className="size-4" />
                Swap
              </Button>
            </div>
          </div>

          {tonight && (
            <div className="border-primary/20 mt-5 border-t pt-4">
              <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                You will need
              </span>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {tonight.ingredients.map((ingredient) => (
                  <span key={ingredient.id} className="text-sm">
                    {capitalizeIngredientName(ingredient.name)}
                    <span className="text-muted-foreground">
                      {ingredient.quantity ? ` ${ingredient.quantity}` : ""}
                      {ingredient.unit ? ` ${ingredient.unit}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {dinner.recipeId && (
            <button
              type="button"
              onClick={() => openRecipe(dinner.recipeId)}
              className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              See the full recipe
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </section>
      ) : (
        <section className="mb-8">
          <EmptyState>Nothing planned for tonight yet.</EmptyState>
        </section>
      )}

      {otherMeals.length > 0 && (
        <section className="mb-8">
          <SectionHeading>Also today</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {otherMeals.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => item.recipeId && openRecipe(item.recipeId)}
                className="hover:border-primary/50 rounded-lg border px-3.5 py-2 text-left transition-colors"
              >
                <span className="text-muted-foreground block text-[0.65rem] font-semibold tracking-wide uppercase">
                  {item.mealSlot}
                </span>
                <span className="text-sm font-medium">{item.displayName}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <SectionHeading>The rest of the week</SectionHeading>
          <Link
            to="/design/c/plan"
            className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
          >
            Open the plan
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {restOfWeek.map((day) => {
            const dayDinner = day.items.find((item) => item.mealSlot === "dinner");

            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-xl border p-3",
                  !dayDinner && "border-dashed"
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground text-[0.65rem] font-semibold tracking-wide uppercase">
                    {weekdayShort(day.date)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {dayOfMonth(day.date)}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-1.5 text-sm leading-snug",
                    dayDinner ? "font-medium" : "text-muted-foreground/70"
                  )}
                >
                  {dayDinner?.displayName ?? "Nothing planned"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <SectionHeading>Not had in a while</SectionHeading>
          <div className="divide-border/70 divide-y rounded-xl border">
            {neglected.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => openRecipe(recipe.id)}
                className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{recipe.name}</p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {duration(totalTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes)) ?? "—"}
                    </span>
                    {recipe.servings && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" />
                        {recipe.servings}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt) : "Never"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading>Recently cooked</SectionHeading>
          <div className="divide-border/70 divide-y rounded-xl border px-3.5">
            {history.slice(0, 6).map((cook) => (
              <CookRow key={cook.id} cook={cook} />
            ))}
          </div>
        </section>
      </div>

      {/* Reading a recipe never leaves Today — the drawer opens over it and
          Back closes it, from the hero, the lists, or the palette. */}
      <Drawer
        open={Boolean(drawerRecipe)}
        onOpenChange={(open) => !open && openRecipe(null)}
        title={drawerRecipe?.name ?? ""}
        subtitle={
          drawerRecipe ? (
            <RecipeMeta recipe={drawerRecipe} lastCooked={drawerRecipe.lastCookedAt} />
          ) : undefined
        }
        footer={
          drawerRecipe && (
            <>
              <Button className="gap-2">
                <UtensilsCrossed className="size-4" />
                Start cooking
              </Button>
              <Button variant="outline" className="gap-2">
                <Flame className="size-4" />
                Log a cook
              </Button>
            </>
          )
        }
      >
        {drawerRecipe && <RecipeBody recipe={drawerRecipe} />}
      </Drawer>
    </div>
  );
}
