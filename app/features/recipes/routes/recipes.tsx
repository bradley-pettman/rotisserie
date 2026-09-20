import { useState, useEffect } from "react";
import { Form, useLoaderData, Link, useNavigate, useSearchParams, useNavigation } from "react-router";
import type { Route } from "./+types/recipes";
import { listRecipes, getAllTags } from "../queries/recipes";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { LayoutGrid, List } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const tagsParam = url.searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined;
  const view = url.searchParams.get("view") || "cards";

  const [recipes, allTags] = await Promise.all([
    listRecipes({ search, tags }),
    getAllTags(),
  ]);

  return { recipes, allTags, filters: { search, tags }, view };
}

export default function RecipesPage() {
  const { recipes, allTags, filters, view } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(filters.search ?? "");

  const isSearching = navigation.state === "loading";

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
  //    pending -- `view` from the toggle, `tags` from a chip. Listing it makes
  //    every URL change tear the timer down and re-arm it against the current
  //    params, so a timer can only ever fire with the newest snapshot, and it
  //    merges into that rather than replacing it. Do not trim this back to
  //    `[searchTerm]`: that is precisely the bug.
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

  const toggleTag = (tagName: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter((t) => t !== tagName)
      : [...currentTags, tagName];

    const params = new URLSearchParams(searchParams);
    if (newTags.length > 0) {
      params.set("tags", newTags.join(","));
    } else {
      params.delete("tags");
    }
    navigate(`/recipes?${params.toString()}`);
  };

  const changeView = (newView: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", newView);
    navigate(`/recipes?${params.toString()}`);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <Link to="/recipes/new">
          <Button>Add Recipe</Button>
        </Link>
      </div>

      {/* Search and Filter */}
      <Form method="get" className="mb-6">
        <input type="hidden" name="view" value={view} />
        {filters.tags && filters.tags.length > 0 && (
          <input type="hidden" name="tags" value={filters.tags.join(",")} />
        )}
        <div className="flex gap-4">
          <Input
            name="search"
            placeholder="Search recipes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
            data-testid="search-input"
          />
          <button type="submit" className="sr-only">Search</button>
        </div>
      </Form>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap" data-testid="tag-filter">
          {allTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.name)}
              data-testid={`tag-${tag.name}`}
              className="focus:outline-none"
            >
              <Badge
                variant={filters.tags?.includes(tag.name) ? "default" : "outline"}
                className="cursor-pointer select-none hover:opacity-80"
              >
                {tag.name}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex border rounded-md overflow-hidden" data-testid="view-toggle">
          <button
            type="button"
            onClick={() => changeView("cards")}
            className={`p-2 transition-colors ${view === "cards" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            title="Card view"
            data-testid="view-cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => changeView("table")}
            className={`p-2 transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            title="Table view"
            data-testid="view-table"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Recipe List */}
      <div aria-busy={isSearching} className={isSearching ? "opacity-50 transition-opacity" : "transition-opacity"}>
        {recipes.length === 0 ? (
          <p className="text-muted-foreground" data-testid="no-recipes">No recipes found. Add your first recipe!</p>
        ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="recipe-cards">
          {recipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle>{recipe.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {recipe.prepTimeMinutes && (
                      <p>Prep: {recipe.prepTimeMinutes} min</p>
                    )}
                    {recipe.cookTimeMinutes && (
                      <p>Cook: {recipe.cookTimeMinutes} min</p>
                    )}
                    {recipe.servings && <p>Servings: {recipe.servings}</p>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden" data-testid="recipe-table">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-semibold">Name</th>
                <th className="text-left p-3 font-semibold hidden sm:table-cell">Prep</th>
                <th className="text-left p-3 font-semibold hidden sm:table-cell">Cook</th>
                <th className="text-left p-3 font-semibold hidden md:table-cell">Servings</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((recipe, index) => (
                <tr
                  key={recipe.id}
                  className={`border-t hover:bg-muted/50 transition-colors ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                >
                  <td className="p-3">
                    <Link
                      to={`/recipes/${recipe.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {recipe.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">
                    {recipe.prepTimeMinutes ? `${recipe.prepTimeMinutes} min` : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">
                    {recipe.cookTimeMinutes ? `${recipe.cookTimeMinutes} min` : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">
                    {recipe.servings || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
