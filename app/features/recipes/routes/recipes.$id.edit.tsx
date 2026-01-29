import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/recipes.$id.edit";
import { getRecipeById, updateRecipe } from "../queries/recipes";
import { createRecipeSchema, type RecipeIngredient } from "../schemas/recipe";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { data } from "react-router";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({ params, request }: Route.ActionArgs) {
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

  await updateRecipe(params.id, result.data);
  return redirect(`/recipes/${params.id}`);
}

export default function EditRecipePage() {
  const { recipe } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    recipe.ingredients.map((ing) => ({
      ingredientName: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      notes: ing.notes,
    }))
  );
  const [tags, setTags] = useState<string[]>(recipe.tags.map((t) => t.name));
  const [tagInput, setTagInput] = useState("");

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { ingredientName: "", quantity: null, unit: null, notes: null },
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: string | number | null) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Edit Recipe</h1>

      <Form method="post">
        <input type="hidden" name="ingredients" value={JSON.stringify(ingredients)} />
        <input type="hidden" name="tags" value={JSON.stringify(tags)} />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Recipe Name *</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={recipe.name}
              />
              {actionData?.errors?.name && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.name[0]}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="prepTimeMinutes">Prep Time (min)</Label>
                <Input
                  id="prepTimeMinutes"
                  name="prepTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue={recipe.prepTimeMinutes ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="cookTimeMinutes">Cook Time (min)</Label>
                <Input
                  id="cookTimeMinutes"
                  name="cookTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue={recipe.cookTimeMinutes ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min="1"
                  defaultValue={recipe.servings ?? ""}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://..."
                defaultValue={recipe.sourceUrl ?? ""}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ingredients *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingredients.map((ing, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    placeholder="Ingredient name"
                    value={ing.ingredientName}
                    onChange={(e) => updateIngredient(index, "ingredientName", e.target.value)}
                    required
                  />
                </div>
                <div className="w-20">
                  <Input
                    placeholder="Qty"
                    type="number"
                    step="0.01"
                    value={ing.quantity ?? ""}
                    onChange={(e) => updateIngredient(index, "quantity", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="w-24">
                  <Input
                    placeholder="Unit"
                    value={ing.unit ?? ""}
                    onChange={(e) => updateIngredient(index, "unit", e.target.value || null)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeIngredient(index)}
                  disabled={ingredients.length === 1}
                >
                  X
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addIngredient}>
              + Add Ingredient
            </Button>
            {actionData?.errors?.ingredients && (
              <p className="text-red-500 text-sm">{actionData.errors.ingredients[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-gray-200 px-2 py-1 rounded text-sm flex items-center gap-1"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}>
                    X
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Instructions *</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="instructions"
              rows={10}
              placeholder="Enter cooking instructions..."
              required
              defaultValue={recipe.instructions}
            />
            {actionData?.errors?.instructions && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.instructions[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              rows={4}
              placeholder="Personal notes about this recipe..."
              defaultValue={recipe.notes ?? ""}
            />
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit">Save Changes</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </Form>
    </div>
  );
}
