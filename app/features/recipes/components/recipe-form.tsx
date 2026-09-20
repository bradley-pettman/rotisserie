import { useState } from "react";
import { Plus, X } from "lucide-react";
import type * as React from "react";
import { Form, Link, useNavigation } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

import type { RecipeIngredient } from "../schemas/recipe";
import type { RecipeWithDetails, Unit } from "../queries/recipes";
import { IngredientCombobox } from "./ingredient-combobox";
import { UnitCombobox } from "./unit-combobox";

/**
 * The recipe editor — and the worked example of when a drawer is the wrong
 * container.
 *
 * This form is nine fields, a repeating ingredient row with three inputs each,
 * a tag editor and a free-text method. In a 34rem drawer the ingredient rows
 * wrap and the method scrolls inside a panel that is itself scrolling. At that
 * point the drawer is a cramped page with a shadow on it, so this is a real
 * route: full width, its own URL, its own back button.
 *
 * Create and edit render this same component. They previously duplicated every
 * line of it, which is how the two forms drifted apart.
 */
export function RecipeForm({
  recipe,
  allIngredients,
  allUnits,
  errors,
  defaults,
  eyebrow,
  submitLabel,
  cancelTo,
  danger,
}: {
  /** The recipe being edited, or null when creating. */
  recipe: RecipeWithDetails | null;
  allIngredients: { id: string; name: string }[];
  allUnits: Unit[];
  errors?: Record<string, string[] | undefined>;
  /** Values to re-seed from after a failed submit. */
  defaults?: { name?: string; instructions?: string };
  eyebrow: string;
  submitLabel: string;
  cancelTo: string;
  /** The delete form, on edit only. Destructive actions live at the bottom. */
  danger?: React.ReactNode;
}) {
  // Saving a recipe is not idempotent -- a second click while the first POST is
  // in flight creates a second recipe. React Router cancels the client fetch on
  // the new navigation, but the first request already reached the server.
  const busy = useNavigation().state === "submitting";

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    recipe && recipe.ingredients.length > 0
      ? recipe.ingredients.map((ingredient) => ({
          ingredientName: ingredient.name,
          // NUMERIC arrives as a number thanks to the pg type parser, but the
          // coercion stays: it costs nothing and the form must not put a
          // string into a numeric field if that override is ever revisited.
          quantity: ingredient.quantity != null ? Number(ingredient.quantity) : null,
          unit: ingredient.unit,
          notes: ingredient.notes,
        }))
      : [{ ingredientName: "", quantity: null, unit: null, notes: null }]
  );
  const [tags, setTags] = useState<string[]>(recipe?.tags.map((tag) => tag.name) ?? []);
  const [tagInput, setTagInput] = useState("");

  const updateIngredient = (
    index: number,
    field: keyof RecipeIngredient,
    value: string | number | null
  ) => {
    setIngredients(
      ingredients.map((ingredient, position) =>
        position === index ? { ...ingredient, [field]: value } : ingredient
      )
    );
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagInput("");
  };

  return (
    <>
      <Form method="post" className="flex flex-col">
        {/* The repeating rows and the chips are state, so they ride along as one
            JSON field each. `parseRecipeFormData` is the other half of this. */}
        <input type="hidden" name="ingredients" value={JSON.stringify(ingredients)} />
        <input type="hidden" name="tags" value={JSON.stringify(tags)} />

        {/* Sticky: on a form this long, Save must not be a scroll away. */}
        <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-8 py-3.5">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{eyebrow}</p>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {recipe?.name ?? "New recipe"}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild variant="ghost">
                <Link to={cancelTo}>Cancel</Link>
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : submitLabel}
              </Button>
            </div>
          </div>
        </header>

          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-4 py-6 md:px-8 md:py-7 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-8">
            <section>
              <Label htmlFor="name" className="mb-2 block">
                Recipe Name <span className="text-muted-foreground">(required)</span>
              </Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={defaults?.name ?? recipe?.name ?? ""}
                className="h-11 text-base"
              />
              {errors?.name && <p className="text-destructive mt-1 text-sm">{errors.name[0]}</p>}
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <Label>
                  Ingredients <span className="text-muted-foreground">(required)</span>
                </Label>
                <span className="text-muted-foreground text-xs">
                  {ingredients.length} {ingredients.length === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="space-y-2">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <IngredientCombobox
                        ingredients={allIngredients}
                        value={ingredient.ingredientName}
                        onChange={(value) => updateIngredient(index, "ingredientName", value)}
                        placeholder="Select ingredient..."
                      />
                    </div>
                    <Input
                      placeholder="Qty"
                      type="number"
                      min="0"
                      step="any"
                      value={ingredient.quantity ?? ""}
                      onChange={(event) =>
                        updateIngredient(
                          index,
                          "quantity",
                          event.target.value ? Number(event.target.value) : null
                        )
                      }
                      className="w-20 tabular-nums"
                    />
                    <div className="w-28">
                      <UnitCombobox
                        units={allUnits}
                        value={ingredient.unit}
                        onChange={(value) => updateIngredient(index, "unit", value)}
                        placeholder="Unit"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove ingredient"
                      disabled={ingredients.length === 1}
                      onClick={() =>
                        setIngredients(ingredients.filter((_, position) => position !== index))
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() =>
                  setIngredients([
                    ...ingredients,
                    { ingredientName: "", quantity: null, unit: null, notes: null },
                  ])
                }
              >
                <Plus className="size-3.5" />
                Add Ingredient
              </Button>

              {errors?.ingredients && (
                <p className="text-destructive mt-2 text-sm">{errors.ingredients[0]}</p>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <Label htmlFor="instructions">
                  Instructions <span className="text-muted-foreground">(required)</span>
                </Label>
                <span className="text-muted-foreground text-xs">One step per line</span>
              </div>
              <Textarea
                id="instructions"
                name="instructions"
                rows={12}
                required
                placeholder="Enter cooking instructions..."
                defaultValue={defaults?.instructions ?? recipe?.instructions ?? ""}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Each line becomes a numbered step when the recipe is read or cooked.
              </p>
              {errors?.instructions && (
                <p className="text-destructive mt-1 text-sm">{errors.instructions[0]}</p>
              )}
            </section>
          </div>

          {/* The rail holds everything that is metadata rather than content. */}
          <aside className="space-y-6">
            <section className="space-y-3">
              <Label>Timing</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="prepTimeMinutes" className="text-muted-foreground mb-1 text-xs">
                    Prep (min)
                  </Label>
                  <Input
                    id="prepTimeMinutes"
                    name="prepTimeMinutes"
                    type="number"
                    min="0"
                    defaultValue={recipe?.prepTimeMinutes ?? ""}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <Label htmlFor="cookTimeMinutes" className="text-muted-foreground mb-1 text-xs">
                    Cook (min)
                  </Label>
                  <Input
                    id="cookTimeMinutes"
                    name="cookTimeMinutes"
                    type="number"
                    min="0"
                    defaultValue={recipe?.cookTimeMinutes ?? ""}
                    className="tabular-nums"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="servings" className="text-muted-foreground mb-1 text-xs">
                  Servings
                </Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min="1"
                  defaultValue={recipe?.servings ?? ""}
                  className="tabular-nums"
                />
              </div>
            </section>

            <section>
              <Label className="mb-2 block">Tags</Label>
              {tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 font-normal">
                      {tag}
                      <button
                        type="button"
                        aria-label={`Remove ${tag}`}
                        onClick={() => setTags(tags.filter((current) => current !== tag))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      // Otherwise Enter submits the whole recipe.
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
            </section>

            <section>
              <Label htmlFor="sourceUrl" className="mb-2 block">
                Source
              </Label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://..."
                defaultValue={recipe?.sourceUrl ?? ""}
              />
            </section>

            <section>
              <Label htmlFor="notes" className="mb-2 block">
                Notes
              </Label>
              <Textarea
                id="notes"
                name="notes"
                rows={5}
                placeholder="Personal notes about this recipe..."
                defaultValue={recipe?.notes ?? ""}
              />
            </section>
          </aside>
        </div>

      </Form>

      {/* Outside the form on purpose: a nested <form> is invalid HTML, and the
          browser would drop it, so Delete would silently stop working. */}
      {danger && <div className="mx-auto w-full max-w-5xl px-4 pb-10 md:px-8">{danger}</div>}
    </>
  );
}
