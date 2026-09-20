import { Clock, Flame, Search, Users, UtensilsCrossed } from "lucide-react";
import { useLoaderData, useSearchParams } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import type { Route } from "./+types/recipes";
import { loadDrawerRecipe, loadLibrary, readFilters } from "../shared/data";
import { Drawer } from "../shared/drawer";
import { duration, relativeDay, totalTime } from "../shared/format";
import { EmptyState, Meta, RecipeMeta, TagList } from "../shared/parts";
import { RecipeBody } from "../shared/recipe-body";

export async function loader({ request }: Route.LoaderArgs) {
  const filters = readFilters(request);

  const [library, drawerRecipe] = await Promise.all([
    loadLibrary(filters),
    loadDrawerRecipe(request),
  ]);

  return { ...library, drawerRecipe };
}

export default function OptionCRecipes() {
  const { recipes, tags, filters, drawerRecipe } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTags = filters.tags ?? [];

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
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">{recipes.length} in the library</p>
      </header>

      <div className="relative mb-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search recipes and ingredients…"
          defaultValue={filters.search ?? ""}
          onChange={(event) => patch("search", event.target.value || null)}
          className="h-10 pl-9"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
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

      {/*
        Cards rather than rows: in a today-first app the library is somewhere
        you BROWSE for an idea, not a table you scan. A denser row list would
        be the right call for A and B, and is what they use.
      */}
      {recipes.length === 0 ? (
        <EmptyState>Nothing matches those filters.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => patch("recipe", recipe.id)}
              className="group hover:border-primary/50 hover:bg-accent/20 flex flex-col rounded-xl border p-4 text-left transition-colors"
            >
              <h2 className="text-sm leading-snug font-semibold">{recipe.name}</h2>

              <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
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

              <TagList tags={recipe.tags} max={3} className="mt-3" />

              <div className="mt-auto pt-3">
                <Meta icon={Flame} className="text-xs">
                  {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt) : "Never cooked"}
                </Meta>
              </div>
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(drawerRecipe)}
        onOpenChange={(open) => !open && patch("recipe", null)}
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
