import { useEffect, useState } from "react";
import { Flame, LayoutGrid, List, Pencil, Search, UtensilsCrossed } from "lucide-react";
import {
  Form,
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";

import { PageHeader } from "~/components/app-shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { EmptyState } from "~/components/ui/section";
import { duration, relativeDay, todayIso, totalTime } from "~/lib/date";
import { cn } from "~/lib/utils";

import { RecipeBody } from "../components/recipe-detail";
import { RecipeMeta, TagList } from "../components/recipe-parts";
import { logCook } from "../queries/cooks";
import { getAllTags, getRecipeDetail, listRecipes } from "../queries/recipes";
import { createCookSchema } from "../schemas/cook";
import type { Route } from "./+types/recipes";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const tagsParam = url.searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined;
  // `table` is the default and is spelled the way the URL has always spelled
  // it, so existing links keep working. Anything unrecognised falls back to
  // the table rather than erroring on a hand-typed parameter.
  const view = url.searchParams.get("view") === "cards" ? "cards" : "table";

  // The open drawer is a URL parameter, not component state, so a recipe is
  // linkable, survives a reload and closes on Back. An id that resolves to
  // nothing simply opens no drawer -- a dead link must not 404 the list
  // behind it.
  const openId = url.searchParams.get("recipe");

  const [recipes, allTags, openRecipe] = await Promise.all([
    listRecipes({ search, tags }, { includeLastCookedAt: true }),
    getAllTags(),
    openId ? getRecipeDetail(openId) : Promise.resolve(null),
  ]);

  // `today` is computed once here, not during render: `new Date()` in a
  // component reads the server's timezone on the server and the browser's in
  // the browser, so "Today"/"Yesterday" could disagree across hydration.
  return { recipes, allTags, filters: { search, tags }, view, openRecipe, today: todayIso() };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  if (formData.get("intent") !== "log-cook") return null;

  const recipeId = String(formData.get("recipeId"));
  const recipe = await getRecipeDetail(recipeId);

  if (!recipe) throw new Response("Recipe not found", { status: 404 });

  // The day is resolved here rather than posted from a hidden field, so a page
  // left open overnight logs the day the button was pressed. `label` snapshots
  // the name as it reads right now: renaming or deleting the recipe later must
  // not rewrite this cook.
  const result = createCookSchema.safeParse({
    recipeId: recipe.id,
    label: recipe.name,
    cookedOn: todayIso(),
    servingsMade: recipe.servings,
    notes: null,
  });

  if (!result.success) throw new Response("Could not log this cook", { status: 400 });

  await logCook(result.data);

  // Redirect rather than returning, so a refresh does not log a second cook.
  // Back to the same drawer: the cook was logged *about* this recipe, and the
  // "last cooked" line the user just changed is right there.
  return redirect(`/recipes?recipe=${recipe.id}`);
}

export default function RecipesPage() {
  const { recipes, allTags, filters, view, openRecipe, today } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(filters.search ?? "");

  const isSearching = navigation.state === "loading";
  const activeTags = filters.tags ?? [];

  // Sync searchTerm with URL changes (browser back/forward)
  useEffect(() => {
    setSearchTerm(filters.search ?? "");
  }, [filters.search]);

  // Debounced navigation effect for live search (state -> URL).
  //
  // Two things here are load-bearing; neither is decoration.
  //
  // 1. The early return. This effect writes the URL and the effect above
  //    writes state *from* the URL, so the pair only settles if the writer
  //    stays quiet whenever the two already agree. Comparing `searchTerm`
  //    against the `search` param the URL actually carries is that test, and
  //    it is also what keeps this effect off the wire on mount: a fresh load
  //    seeds `searchTerm` from `filters.search`, the two agree, and no timer
  //    is ever armed. Same for a back/forward, where the sync effect lands
  //    state on the value the URL already holds. Without it, landing on
  //    /recipes scheduled a `replace` navigation 300ms later for a search the
  //    user never typed.
  //
  // 2. `searchParams` in the dependency array. An armed timer navigates with
  //    `replace: true`, so whatever params it captured *overwrite* the URL
  //    when it fires. Left out of the deps, that capture went stale and the
  //    timer silently reverted anything the user changed while it was
  //    pending -- `view` from the toggle, `tags` from a chip, `recipe` from
  //    opening the drawer. Listing it makes every URL change tear the timer
  //    down and re-arm it against the current params, so a timer can only ever
  //    fire with the newest snapshot, and it merges into that rather than
  //    replacing it. Do not trim this back to `[searchTerm]`: that is
  //    precisely the bug.
  useEffect(() => {
    if (searchTerm === (searchParams.get("search") ?? "")) return;

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (searchTerm) {
        params.set("search", searchTerm);
      } else {
        params.delete("search");
      }
      navigate(`/recipes?${params.toString()}`, { replace: true });
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchTerm, searchParams, navigate]);

  /** Merge one parameter into the URL, preserving every other one. */
  const patch = (key: string, value: string | null, options?: { replace?: boolean }) => {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete(key);
    else params.set(key, value);
    navigate(`/recipes?${params.toString()}`, {
      replace: options?.replace,
      preventScrollReset: true,
    });
  };

  const toggleTag = (tagName: string) => {
    const next = activeTags.includes(tagName)
      ? activeTags.filter((tag) => tag !== tagName)
      : [...activeTags, tagName];

    patch("tags", next.length > 0 ? next.join(",") : null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-7">
      <PageHeader
        title="Recipes"
        subtitle={`${recipes.length} in the library`}
        actions={
          <div className="flex overflow-hidden rounded-md border" data-testid="view-toggle">
            <button
              type="button"
              onClick={() => patch("view", "table")}
              className={cn(
                "p-2 transition-colors",
                view === "table"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
              title="List view"
              data-testid="view-table"
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => patch("view", "cards")}
              className={cn(
                "p-2 transition-colors",
                view === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
              title="Card view"
              data-testid="view-cards"
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        }
      />

      {/* Wrapped in a GET form so search still works with JavaScript off; the
          debounced effect above is the enhancement, not the mechanism. */}
      <Form method="get" className="relative mb-4">
        <input type="hidden" name="view" value={view} />
        {activeTags.length > 0 && <input type="hidden" name="tags" value={activeTags.join(",")} />}
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          name="search"
          placeholder="Search recipes and ingredients…"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="h-10 pl-9"
          data-testid="search-input"
        />
        <button type="submit" className="sr-only">
          Search
        </button>
      </Form>

      {allTags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5" data-testid="tag-filter">
          {allTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.name)}
              data-testid={`tag-${tag.name}`}
              className="focus:outline-none"
            >
              <Badge
                variant={activeTags.includes(tag.name) ? "default" : "outline"}
                className="cursor-pointer font-normal select-none hover:opacity-80"
              >
                {tag.name}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <div
        aria-busy={isSearching}
        className={isSearching ? "opacity-50 transition-opacity" : "transition-opacity"}
      >
        {recipes.length === 0 ? (
          <EmptyState>
            <span data-testid="no-recipes">No recipes found. Add your first recipe!</span>
          </EmptyState>
        ) : view === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="recipe-cards">
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => patch("recipe", recipe.id)}
                className="hover:border-primary/50 hover:bg-accent/20 flex flex-col rounded-xl border p-4 text-left transition-colors"
              >
                <h2 className="text-sm leading-snug font-semibold">{recipe.name}</h2>
                <RecipeMeta
                  recipe={recipe}
                  lastCooked={recipe.lastCookedAt}
                  today={today}
                  className="mt-2 text-xs"
                />
                <TagList tags={recipe.tags} max={3} className="mt-3" />
              </button>
            ))}
          </div>
        ) : (
          /* A real table: the three things you compare recipes on are columns,
             and a screen reader gets row and column semantics for free. */
          <div className="overflow-hidden rounded-xl border" data-testid="recipe-table">
            <table className="w-full">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="p-3 text-left font-medium">Recipe</th>
                  <th className="hidden w-32 p-3 text-right font-medium sm:table-cell">
                    Total time
                  </th>
                  <th className="hidden w-32 p-3 text-right font-medium md:table-cell">
                    Last cooked
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const open = openRecipe?.id === recipe.id;

                  return (
                    <tr
                      key={recipe.id}
                      className={cn(
                        "border-t transition-colors",
                        open ? "bg-accent/60" : "hover:bg-muted/50"
                      )}
                    >
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => patch("recipe", recipe.id)}
                          className="text-left"
                        >
                          <span className="text-sm font-medium">{recipe.name}</span>
                        </button>
                        <TagList tags={recipe.tags} max={3} className="mt-1.5" />
                      </td>
                      <td className="text-muted-foreground hidden p-3 text-right text-sm tabular-nums sm:table-cell">
                        {duration(totalTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes)) ??
                          "—"}
                      </td>
                      <td
                        className={cn(
                          "hidden p-3 text-right text-sm md:table-cell",
                          recipe.lastCookedAt
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                        )}
                      >
                        {recipe.lastCookedAt ? relativeDay(recipe.lastCookedAt, today) : "Never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Closing drops only the `recipe` param, so every filter and the scroll
          position survive: the list is exactly where it was left. */}
      <Drawer
        open={Boolean(openRecipe)}
        onOpenChange={(next) => !next && patch("recipe", null)}
        title={openRecipe?.name ?? ""}
        subtitle={
          openRecipe ? (
            <RecipeMeta recipe={openRecipe} lastCooked={openRecipe.lastCookedAt} today={today} />
          ) : undefined
        }
        footer={
          openRecipe && (
            <>
              <Button asChild className="gap-2">
                <Link to={`/recipes/${openRecipe.id}/cook`}>
                  <UtensilsCrossed className="size-4" />
                  Cooking mode
                </Link>
              </Button>
              <Form method="post">
                <input type="hidden" name="intent" value="log-cook" />
                <input type="hidden" name="recipeId" value={openRecipe.id} />
                {/* Disabled while submitting: `cooks` is append-only fact
                    with no de-duplication, so a double click logs the meal
                    twice and there is no way to undo it from the UI. */}
                <Button
                  type="submit"
                  disabled={navigation.state === "submitting"}
                  variant="outline"
                  className="gap-2"
                >
                  <Flame className="size-4" />
                  Log a cook
                </Button>
              </Form>
              <Button asChild variant="ghost" size="icon" className="ml-auto">
                <Link to={`/recipes/${openRecipe.id}/edit`} aria-label="Edit">
                  <Pencil className="size-4" />
                </Link>
              </Button>
            </>
          )
        }
      >
        {openRecipe && <RecipeBody recipe={openRecipe} />}
      </Drawer>
    </div>
  );
}
