import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigation, useNavigate } from "react-router";
import type { Route } from "./+types/recipes.new";
import { createRecipe, getAllIngredients, getAllUnits } from "../queries/recipes";
import { createRecipeSchema, type RecipeIngredient } from "../schemas/recipe";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { IngredientCombobox } from "../components/ingredient-combobox";
import { UnitCombobox } from "../components/unit-combobox";
import { data } from "react-router";
import { scrapeRecipeFromUrl, type ScrapedRecipe } from "../lib/scrape-recipe";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const importUrl = url.searchParams.get("importUrl");

  const [allIngredients, allUnits] = await Promise.all([
    getAllIngredients(),
    getAllUnits(),
  ]);

  let imported: ScrapedRecipe | null = null;
  let importError: string | null = null;

  if (importUrl) {
    try {
      new URL(importUrl);
      imported = await scrapeRecipeFromUrl(importUrl);
    } catch (err) {
      importError = err instanceof Error ? err.message : "Failed to import recipe";
    }
  }

  return { allIngredients, allUnits, imported, importError };
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
      { errors: result.error.flatten().fieldErrors, input },
      { status: 400 }
    );
  }

  const recipe = await createRecipe(result.data);
  return redirect(`/recipes/${recipe.id}`);
}

export default function NewRecipePage() {
  const { allIngredients, allUnits, imported, importError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const isImporting =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/recipes/new" &&
    new URLSearchParams(navigation.location?.search).has("importUrl");

  const defaultIngredients: RecipeIngredient[] =
    imported && imported.ingredients.length > 0
      ? imported.ingredients
      : [{ ingredientName: "", quantity: null, unit: null, notes: null }];

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(defaultIngredients);
  const [tags, setTags] = useState<string[]>(imported?.tags ?? []);
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
      <h1 className="text-3xl font-bold mb-6">New Recipe</h1>

      <Card className="mb-6 border-dashed">
        <CardHeader>
          <CardTitle>Import from URL</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Paste a recipe URL to auto-fill the form. You can review and edit before saving.
          </p>
          <Form method="get" className="flex gap-2">
            <Input
              name="importUrl"
              placeholder="https://www.example.com/recipe/..."
              defaultValue=""
              disabled={isImporting}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={isImporting}
            >
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </Form>
          {importError && (
            <p className="text-red-500 text-sm mt-2">{importError}</p>
          )}
          {imported && !importError && (
            <p className="text-green-600 text-sm mt-2">Recipe imported! Review the details below and click Save when ready.</p>
          )}
        </CardContent>
      </Card>

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
                defaultValue={imported?.name ?? actionData?.input?.name ?? ""}
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
                  defaultValue={imported?.prepTimeMinutes ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="cookTimeMinutes">Cook Time (min)</Label>
                <Input
                  id="cookTimeMinutes"
                  name="cookTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue={imported?.cookTimeMinutes ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min="1"
                  defaultValue={imported?.servings ?? ""}
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
                defaultValue={imported?.sourceUrl ?? ""}
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
                  <IngredientCombobox
                    ingredients={allIngredients}
                    value={ing.ingredientName}
                    onChange={(value) => updateIngredient(index, "ingredientName", value)}
                    placeholder="Select ingredient..."
                  />
                </div>
                <div className="w-20">
                  <Input
                    placeholder="Qty"
                    type="number"
                    min="0"
                    step="any"
                    value={ing.quantity ?? ""}
                    onChange={(e) => updateIngredient(index, "quantity", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="w-28">
                  <UnitCombobox
                    units={allUnits}
                    value={ing.unit}
                    onChange={(value) => updateIngredient(index, "unit", value)}
                    placeholder="Unit"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeIngredient(index)}
                  disabled={ingredients.length === 1}
                >
                  ✕
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
                    ✕
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
              defaultValue={imported?.instructions ?? actionData?.input?.instructions ?? ""}
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
              defaultValue={imported?.notes ?? ""}
            />
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit">Save Recipe</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </Form>
    </div>
  );
}
