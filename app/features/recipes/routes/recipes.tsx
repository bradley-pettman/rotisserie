import { data, Form, useLoaderData, useActionData, redirect } from "react-router";
import type { Route } from "./+types/recipes";
import { listRecipes, createRecipe, getAllTags } from "../queries/recipes";
import { createRecipeSchema } from "../schemas/recipe";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Link } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const tagsParam = url.searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",") : undefined;

  const [recipes, allTags] = await Promise.all([
    listRecipes({ search, tags }),
    getAllTags(),
  ]);

  return { recipes, allTags, filters: { search, tags } };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const ingredientsJson = formData.get("ingredients") as string;
  const tagsJson = formData.get("tags") as string;

  const input = {
    name: formData.get("name") as string,
    instructions: formData.get("instructions") as string,
    prepTimeMinutes: formData.get("prepTimeMinutes")
      ? Number(formData.get("prepTimeMinutes"))
      : null,
    cookTimeMinutes: formData.get("cookTimeMinutes")
      ? Number(formData.get("cookTimeMinutes"))
      : null,
    servings: formData.get("servings") ? Number(formData.get("servings")) : null,
    sourceUrl: (formData.get("sourceUrl") as string) || null,
    notes: (formData.get("notes") as string) || null,
    ingredients: ingredientsJson ? JSON.parse(ingredientsJson) : [],
    tags: tagsJson ? JSON.parse(tagsJson) : [],
  };

  const result = createRecipeSchema.safeParse(input);

  if (!result.success) {
    return data(
      { errors: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const recipe = await createRecipe(result.data);
  return redirect(`/recipes/${recipe.id}`);
}

export default function RecipesPage() {
  const { recipes, allTags, filters } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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
        <div className="flex gap-4">
          <Input
            name="search"
            placeholder="Search recipes..."
            defaultValue={filters.search}
            className="max-w-sm"
          />
          <Button type="submit">Search</Button>
        </div>
        {allTags.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {allTags.map((tag) => (
              <Badge
                key={tag.id}
                variant={filters.tags?.includes(tag.name) ? "default" : "outline"}
                className="cursor-pointer"
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </Form>

      {/* Recipe List */}
      {recipes.length === 0 ? (
        <p className="text-gray-500">No recipes found. Add your first recipe!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle>{recipe.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-500 space-y-1">
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
      )}
    </div>
  );
}
