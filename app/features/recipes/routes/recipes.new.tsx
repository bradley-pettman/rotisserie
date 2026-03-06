import { useState, useEffect, useRef } from "react";
import { Form, redirect, useActionData, useFetcher, useLoaderData, useNavigate } from "react-router";
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
import type { ScrapedRecipe } from "../lib/scrape-recipe";

export async function loader() {
  const [allIngredients, allUnits] = await Promise.all([
    getAllIngredients(),
    getAllUnits(),
  ]);
  return { allIngredients, allUnits };
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
  const { allIngredients, allUnits } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const importFetcher = useFetcher<{ error: string | null; recipe: ScrapedRecipe | null }>();

  const [name, setName] = useState(actionData?.input?.name ?? "");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<string>("");
  const [cookTimeMinutes, setCookTimeMinutes] = useState<string>("");
  const [servings, setServings] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [instructions, setInstructions] = useState(actionData?.input?.instructions ?? "");
  const [notes, setNotes] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([
    { ingredientName: "", quantity: null, unit: null, notes: null },
  ]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [importUrl, setImportUrl] = useState("");

  const isImporting = importFetcher.state !== "idle";
  const prevImportState = useRef(importFetcher.state);

  // Populate form when import completes
  useEffect(() => {
    if (prevImportState.current !== "idle" && importFetcher.state === "idle" && importFetcher.data?.recipe) {
      const recipe = importFetcher.data.recipe;
      setName(recipe.name ?? "");
      setPrepTimeMinutes(recipe.prepTimeMinutes?.toString() ?? "");
      setCookTimeMinutes(recipe.cookTimeMinutes?.toString() ?? "");
      setServings(recipe.servings?.toString() ?? "");
      setSourceUrl(recipe.sourceUrl ?? "");
      setInstructions(recipe.instructions ?? "");
      setNotes(recipe.notes ?? "");
      setTags(recipe.tags ?? []);
      if (recipe.ingredients.length > 0) {
        setIngredients(recipe.ingredients);
      }
    }
    prevImportState.current = importFetcher.state;
  }, [importFetcher.state, importFetcher.data]);

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

  const handleImport = () => {
    if (!importUrl.trim()) return;
    importFetcher.submit(
      { url: importUrl },
      { method: "post", action: "/recipes/import" }
    );
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
          <div className="flex gap-2">
            <Input
              placeholder="https://www.example.com/recipe/..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleImport();
                }
              }}
              disabled={isImporting}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleImport}
              disabled={isImporting || !importUrl.trim()}
            >
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
          {importFetcher.data?.error && (
            <p className="text-red-500 text-sm mt-2">{importFetcher.data.error}</p>
          )}
          {importFetcher.data?.recipe && !importFetcher.data?.error && (
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
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                  value={prepTimeMinutes}
                  onChange={(e) => setPrepTimeMinutes(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cookTimeMinutes">Cook Time (min)</Label>
                <Input
                  id="cookTimeMinutes"
                  name="cookTimeMinutes"
                  type="number"
                  min="0"
                  value={cookTimeMinutes}
                  onChange={(e) => setCookTimeMinutes(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min="1"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
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
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
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
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
