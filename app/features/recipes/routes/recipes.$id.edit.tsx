import { Trash2 } from "lucide-react";
import { Form, data, redirect, useActionData, useLoaderData } from "react-router";

import { Button } from "~/components/ui/button";

import { RecipeForm } from "../components/recipe-form";
import { parseRecipeFormData } from "../lib/recipe-form-data";
import {
  deleteRecipe,
  getAllIngredients,
  getAllUnits,
  getRecipeById,
  updateRecipe,
} from "../queries/recipes";
import { createRecipeSchema } from "../schemas/recipe";
import type { Route } from "./+types/recipes.$id.edit";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const [allIngredients, allUnits] = await Promise.all([getAllIngredients(), getAllUnits()]);

  return { recipe, allIngredients, allUnits };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();

  /**
   * Deleting lives here rather than on the read surface.
   *
   * The drawer over the list is for reading and for the one-click things;
   * destroying a recipe is neither, and a destructive control in a panel you
   * open by clicking a row is a control you will eventually hit by accident.
   *
   * Note what deleting does NOT do: `cooks.recipe_id` is ON DELETE SET NULL
   * alongside a snapshot label, so the record of having cooked this survives.
   * `meal_plan_items.recipe_id` is ON DELETE CASCADE, because a plan to cook
   * something that no longer exists is meaningless.
   */
  if (formData.get("intent") === "delete") {
    await deleteRecipe(params.id);
    return redirect("/recipes");
  }

  const result = createRecipeSchema.safeParse(parseRecipeFormData(formData));

  if (!result.success) {
    return data({ errors: result.error.flatten().fieldErrors }, { status: 400 });
  }

  await updateRecipe(params.id, result.data);

  return redirect(`/recipes?recipe=${params.id}`);
}

export default function EditRecipePage() {
  const { recipe, allIngredients, allUnits } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <RecipeForm
      recipe={recipe}
      allIngredients={allIngredients}
      allUnits={allUnits}
      errors={actionData?.errors}
      eyebrow="Editing recipe"
      submitLabel="Save Changes"
      cancelTo={`/recipes?recipe=${recipe.id}`}
      danger={
        <div className="border-destructive/30 flex items-center justify-between gap-4 rounded-lg border border-dashed p-4">
          <div>
            <p className="text-sm font-medium">Delete this recipe</p>
            <p className="text-muted-foreground text-xs">
              Meals already cooked from it stay in your history.
            </p>
          </div>
          <Form
            method="post"
            onSubmit={(event) => {
              if (!confirm("Are you sure you want to delete this recipe?")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <Button type="submit" variant="destructive" className="gap-2">
              <Trash2 className="size-4" />
              Delete Recipe
            </Button>
          </Form>
        </div>
      }
    />
  );
}
