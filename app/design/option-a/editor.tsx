import { useLoaderData } from "react-router";

import type { Route } from "./+types/editor";
import { loadRecipe } from "../shared/data";
import { RecipeEditor } from "../shared/editor";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await loadRecipe(params.id);

  if (!recipe) throw new Response("Recipe not found", { status: 404 });

  return { recipe };
}

export default function OptionAEditor() {
  const { recipe } = useLoaderData<typeof loader>();

  return <RecipeEditor recipe={recipe} backTo={`/design/a?recipe=${recipe.id}`} />;
}
