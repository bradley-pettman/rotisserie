import { useState } from "react";
import { data, Form, useLoaderData, useActionData, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/recipes";
import { listRecipes, getAllTags, deleteRecipesByPattern } from "../queries/recipes";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { LayoutGrid, List, Trash2 } from "lucide-react";

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

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cleanup-test-recipes") {
    const pattern = formData.get("pattern") as string;
    if (pattern && pattern.length >= 3) {
      const deletedCount = await deleteRecipesByPattern(pattern);
      return { success: true, deletedCount };
    }
    return data({ error: "Pattern must be at least 3 characters" }, { status: 400 });
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

export default function RecipesPage() {
  const { recipes, allTags, filters, view } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupPattern, setCleanupPattern] = useState("Test Recipe");

  const toggleTag = (tagName: string) => {
    const currentTags = searchParams.get("tags")?.split(",").filter(Boolean) || [];
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter((t) => t !== tagName)
      : [...currentTags, tagName];

    const newParams = new URLSearchParams(searchParams);
    if (newTags.length > 0) {
      newParams.set("tags", newTags.join(","));
    } else {
      newParams.delete("tags");
    }
    setSearchParams(newParams);
  };

  const setView = (newView: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("view", newView);
    setSearchParams(newParams);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowCleanup(!showCleanup)}
            title="Clean up test recipes"
            data-testid="cleanup-toggle"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Link to="/recipes/new">
            <Button>Add Recipe</Button>
          </Link>
        </div>
      </div>

      {/* Cleanup Panel */}
      {showCleanup && (
        <div className="mb-6 p-4 bg-muted rounded-lg border" data-testid="cleanup-panel">
          <h3 className="font-semibold mb-2">Clean Up Test Recipes</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Delete all recipes matching a pattern. Use with caution.
          </p>
          <Form method="post" className="flex gap-2 items-end">
            <input type="hidden" name="intent" value="cleanup-test-recipes" />
            <div className="flex-1">
              <Input
                name="pattern"
                value={cleanupPattern}
                onChange={(e) => setCleanupPattern(e.target.value)}
                placeholder="Pattern to match (e.g., Test Recipe)"
                data-testid="cleanup-pattern"
              />
            </div>
            <Button type="submit" variant="destructive" data-testid="cleanup-submit">
              Delete Matching
            </Button>
          </Form>
          {actionData && "deletedCount" in actionData && (
            <p className="mt-2 text-sm text-green-600" data-testid="cleanup-success">
              Deleted {actionData.deletedCount} recipe(s)
            </p>
          )}
          {actionData && "error" in actionData && (
            <p className="mt-2 text-sm text-red-600" data-testid="cleanup-error">{actionData.error}</p>
          )}
        </div>
      )}

      {/* Search and Filter */}
      <Form method="get" className="mb-6">
        <input type="hidden" name="view" value={view} />
        {filters.tags?.map((tag) => (
          <input key={tag} type="hidden" name="tags" value={filters.tags?.join(",")} />
        ))}
        <div className="flex gap-4">
          <Input
            name="search"
            placeholder="Search recipes..."
            defaultValue={filters.search}
            className="max-w-sm"
            data-testid="search-input"
          />
          <Button type="submit" data-testid="search-submit">Search</Button>
        </div>
      </Form>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap" data-testid="tag-filter">
          {allTags.map((tag) => (
            <Badge
              key={tag.id}
              variant={filters.tags?.includes(tag.name) ? "default" : "outline"}
              className="cursor-pointer select-none"
              onClick={() => toggleTag(tag.name)}
              data-testid={`tag-${tag.name}`}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex border rounded-md overflow-hidden" data-testid="view-toggle">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`p-2 transition-colors ${view === "cards" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            title="Card view"
            data-testid="view-cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`p-2 transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            title="Table view"
            data-testid="view-table"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Recipe List */}
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
  );
}
