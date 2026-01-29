import { useLoaderData, Link, Form, redirect } from "react-router";
import type { Route } from "./+types/recipes.$id";
import { getRecipeById, deleteRecipe } from "../queries/recipes";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    await deleteRecipe(params.id);
    return redirect("/recipes");
  }

  return null;
}

export default function RecipeDetailPage() {
  const { recipe } = useLoaderData<typeof loader>();

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link to="/recipes" className="text-blue-600 hover:underline text-sm">
            ← Back to Recipes
          </Link>
          <h1 className="text-3xl font-bold mt-2">{recipe.name}</h1>
          {recipe.tags.length > 0 && (
            <div className="flex gap-2 mt-2">
              {recipe.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/recipes/${recipe.id}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <Link to={`/recipes/${recipe.id}/cook`}>
            <Button>Cooking Mode</Button>
          </Link>
        </div>
      </div>

      {/* Time and Servings */}
      <div className="flex gap-6 mb-6 text-sm text-gray-600">
        {recipe.prepTimeMinutes && <span>Prep: {recipe.prepTimeMinutes} min</span>}
        {recipe.cookTimeMinutes && <span>Cook: {recipe.cookTimeMinutes} min</span>}
        {totalTime > 0 && <span className="font-medium">Total: {totalTime} min</span>}
        {recipe.servings && <span>Servings: {recipe.servings}</span>}
      </div>

      {recipe.sourceUrl && (
        <p className="mb-6 text-sm">
          Source:{" "}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {recipe.sourceUrl}
          </a>
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Ingredients */}
        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex justify-between">
                  <span>{ing.name}</span>
                  <span className="text-gray-500">
                    {ing.quantity && `${ing.quantity}`}
                    {ing.unit && ` ${ing.unit}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap">{recipe.instructions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {recipe.notes && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{recipe.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Delete */}
      <div className="mt-8 pt-8 border-t">
        <Form method="post" onSubmit={(e) => {
          if (!confirm("Are you sure you want to delete this recipe?")) {
            e.preventDefault();
          }
        }}>
          <input type="hidden" name="intent" value="delete" />
          <Button type="submit" variant="destructive">
            Delete Recipe
          </Button>
        </Form>
      </div>
    </div>
  );
}
