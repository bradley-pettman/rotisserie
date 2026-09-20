import { useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { capitalizeIngredientName } from "~/features/recipes/lib/display-name";

import type { RecipeDetail } from "./data";
import { steps } from "./parts";

/**
 * The recipe editor — and the argument for when a drawer is the wrong answer.
 *
 * This form is nine fields, a repeating ingredient row with three inputs each,
 * a tag editor and a step list. In a 34rem drawer the ingredient rows wrap and
 * the step list scrolls inside a panel that is itself scrolling. At that point
 * the drawer is a cramped page with a shadow on it, and the honest move is a
 * real route: full width, its own URL, its own back button.
 *
 * The rule the prototypes follow: a drawer is for ONE decision made against
 * the context behind it. An editor is a task, not a decision.
 *
 * Presentational only — this is a design prototype, so nothing here writes.
 */
export function RecipeEditor({
  recipe,
  backTo,
}: {
  recipe: RecipeDetail | null;
  backTo: string;
}) {
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients.length
      ? recipe.ingredients.map((ingredient) => ({
          name: capitalizeIngredientName(ingredient.name),
          quantity: ingredient.quantity?.toString() ?? "",
          unit: ingredient.unit ?? "",
        }))
      : [{ name: "", quantity: "", unit: "" }]
  );
  const [tags, setTags] = useState(recipe?.tags.map((tag) => tag.name) ?? []);

  const method = recipe ? steps(recipe.instructions) : [];

  return (
    <form
      className="flex min-h-screen flex-col"
      onSubmit={(event) => event.preventDefault()}
    >
      {/* Sticky action bar: on a form this long, Save must not be a scroll away. */}
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-8 py-3.5">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">
              {recipe ? "Editing recipe" : "New recipe"}
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {recipe?.name ?? "Untitled recipe"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost">
              <Link to={backTo}>Cancel</Link>
            </Button>
            <Button type="submit">Save recipe</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-[1fr_17rem] gap-8 px-8 py-7">
        <div className="min-w-0 space-y-8">
          <section className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue={recipe?.name ?? ""} className="h-11 text-base" />
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <Label>Ingredients</Label>
              <span className="text-muted-foreground text-xs">
                {ingredients.length} {ingredients.length === 1 ? "item" : "items"}
              </span>
            </div>

            <div className="space-y-2">
              {ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center gap-2">
                  <GripVertical className="text-muted-foreground/50 size-4 shrink-0 cursor-grab" />
                  <Input defaultValue={ingredient.name} placeholder="Ingredient" className="flex-1" />
                  <Input
                    defaultValue={ingredient.quantity}
                    placeholder="Qty"
                    className="w-20 tabular-nums"
                  />
                  <Input defaultValue={ingredient.unit} placeholder="Unit" className="w-28" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove ingredient"
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
              onClick={() => setIngredients([...ingredients, { name: "", quantity: "", unit: "" }])}
            >
              <Plus className="size-3.5" />
              Add ingredient
            </Button>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <Label>Method</Label>
              <span className="text-muted-foreground text-xs">One step per line</span>
            </div>
            <div className="space-y-2">
              {(method.length ? method : [""]).map((step, index) => (
                <div key={index} className="flex gap-2">
                  <span className="bg-secondary text-secondary-foreground mt-2 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <Textarea defaultValue={step} rows={2} className="flex-1 resize-y" />
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5">
              <Plus className="size-3.5" />
              Add step
            </Button>
          </section>
        </div>

        {/* The side rail holds everything that is metadata rather than content. */}
        <aside className="space-y-6">
          <section className="space-y-3">
            <Label>Timing</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground mb-1 block text-xs">Prep</span>
                <Input defaultValue={recipe?.prepTimeMinutes ?? ""} className="tabular-nums" />
              </div>
              <div>
                <span className="text-muted-foreground mb-1 block text-xs">Cook</span>
                <Input defaultValue={recipe?.cookTimeMinutes ?? ""} className="tabular-nums" />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground mb-1 block text-xs">Servings</span>
              <Input defaultValue={recipe?.servings ?? ""} className="tabular-nums" />
            </div>
          </section>

          <section>
            <Label className="mb-2 block">Tags</Label>
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
            <Input placeholder="Add a tag…" />
          </section>

          <section>
            <Label className="mb-2 block">Source</Label>
            <Input defaultValue={recipe?.sourceUrl ?? ""} placeholder="https://…" />
          </section>

          <section>
            <Label className="mb-2 block">Notes</Label>
            <Textarea defaultValue={recipe?.notes ?? ""} rows={5} />
          </section>
        </aside>
      </div>
    </form>
  );
}
