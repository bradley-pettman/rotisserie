import { data, redirect, useActionData, useLoaderData } from "react-router";

import { RecipeForm } from "../components/recipe-form";
import { parseRecipeFormData } from "../lib/recipe-form-data";
import { createRecipe, getAllIngredients, getAllUnits } from "../queries/recipes";
import { createRecipeSchema } from "../schemas/recipe";
import type { Route } from "./+types/recipes.new";

export async function loader() {
  const [allIngredients, allUnits] = await Promise.all([getAllIngredients(), getAllUnits()]);

  return { allIngredients, allUnits };
}

export async function action({ request }: Route.ActionArgs) {
  const input = parseRecipeFormData(await request.formData());
  const result = createRecipeSchema.safeParse(input);

  if (!result.success) {
    // `input` goes back so the form can re-seed the fields the user typed
    // rather than clearing them on a validation failure.
    return data({ errors: result.error.flatten().fieldErrors, input }, { status: 400 });
  }

  const recipe = await createRecipe(result.data);

  // Straight into the new recipe's drawer, open over the list it just joined.
  return redirect(`/recipes?recipe=${recipe.id}`);
}

export default function NewRecipePage() {
  const { allIngredients, allUnits } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <RecipeForm
      recipe={null}
      allIngredients={allIngredients}
      allUnits={allUnits}
      errors={actionData?.errors}
      defaults={actionData?.input}
      eyebrow="New recipe"
      submitLabel="Save Recipe"
      cancelTo="/recipes"
    />
  );
}
