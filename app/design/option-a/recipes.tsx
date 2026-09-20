import { Flame, Pencil, Search, SlidersHorizontal, UtensilsCrossed } from "lucide-react";
import { Link, useLoaderData, useSearchParams } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

import type { Route } from "./+types/recipes";
import { PageHeader } from "./layout";
import { loadDrawerRecipe, loadLibrary, readFilters } from "../shared/data";
import { Drawer } from "../shared/drawer";
import { duration, relativeDay, totalTime } from "../shared/format";
import { EmptyState, RecipeMeta, TagList } from "../shared/parts";
import { RecipeBody } from "../shared/recipe-body";

export async function loader({ request }: Route.LoaderArgs) {
  const filters = readFilters(request);

  // Both in parallel: the drawer's recipe is not a second page load, it is
  // part of the same URL's data.
  const [library, drawerRecipe] = await Promise.all([
    loadLibrary(filters),
    loadDrawerRecipe(request),
  ]);

  return { ...library, drawerRecipe };
}

export default function OptionARecipes() {
  const { recipes, tags, filters, drawerRecipe } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTags = filters.tags ?? [];

  /** Merge one param into the URL, preserving the rest. */
  const patch = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { preventScrollReset: true });
  };

  const toggleTag = (name: string) => {
    const next = activeTags.includes(name)
      ? activeTags.filter((tag) => tag !== name)
      : [...activeTags, name];
    patch("tags", next.length ? next.join(",") : null);
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Recipes"
        subtitle={`${recipes.length} in the library`}
        actions={
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="size-4" />
            Filters
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search recipes and ingredients…"
          defaultValue={filters.search ?? ""}
          onChange={(event) => patch("search", event.target.value || null)}
          className="h-10 pl-9"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button key={tag.id} type="button" onClick={() => toggleTag(tag.name)}>
            <Badge
              variant={activeTags.includes(tag.name) ? "default" : "outline"}
              className="cursor-pointer font-normal select-none"
            >
              {tag.name}
            </Badge>
          </button>
        ))}
      </div>

      {recipes.length === 0 ? (
        <EmptyState>Nothing matches those filters.</EmptyState>
      ) : (
        <div className="divide-border overflow-hidden rounded-xl border divide-y">
          {/* Column labels, so the numbers on the right are readable as data
              rather than as decoration next to each title. */}
          <div className="text-muted-foreground bg-muted/50 flex items-center gap-4 px-4 py-2 text-xs font-medium">
            <span className="flex-1">Recipe</span>
            <span className="w-24 text-right">Total time</span>
            <span className="w-28 text-right">Last cooked</span>
          </div>

          {recipes.map((recipe) => {
            const active = drawerRecipe?.id === recipe.id;

            return (
              <button
                key={recipe.id}
                type="button"
                onClick={() => patch("recipe", recipe.id)}
                className={cn(
                  "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors",
                  active ? "bg-accent/60" : "hover:bg-muted/50"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{recipe.name}</p>
                  <TagList tags={recipe.tags} max={3} className="mt-1.5" />
                </div>
                <span className="text-muted-foreground w-24 shrink-0 text-right text-sm tabular-nums">
                  {duration(totalTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes)) ?? "—"}
                </span>
                <span
                  className={cn(
                    "w-28 shrink-0 text-right text-sm",
                    recipe.lastCookedAt ? "text-muted-foreground" : "text-muted-foreground/60"
                  )}
                >
                  {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt) : "Never"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/*
        The drawer's open state IS the `?recipe=` param, so it is linkable,
        survives a reload, and Back closes it. Closing drops the param and
        leaves every filter in place — the list is exactly where you left it.
      */}
      <Drawer
        open={Boolean(drawerRecipe)}
        onOpenChange={(open) => !open && patch("recipe", null)}
        title={drawerRecipe?.name ?? ""}
        subtitle={
          drawerRecipe ? (
            <RecipeMeta recipe={drawerRecipe} lastCooked={drawerRecipe.lastCookedAt ?? null} />
          ) : undefined
        }
        footer={
          drawerRecipe && (
            <>
              <Button className="gap-2">
                <UtensilsCrossed className="size-4" />
                Cooking mode
              </Button>
              <Button variant="outline" className="gap-2">
                <Flame className="size-4" />
                Log a cook
              </Button>
              <Button asChild variant="ghost" size="icon" className="ml-auto">
                <Link to={`/design/a/recipes/${drawerRecipe.id}/edit`} aria-label="Edit recipe">
                  <Pencil className="size-4" />
                </Link>
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
