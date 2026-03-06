import { data } from "react-router";
import type { Route } from "./+types/recipes.import";
import { scrapeRecipeFromUrl } from "../lib/scrape-recipe";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const url = formData.get("url") as string;

  if (!url) {
    return data({ error: "URL is required", recipe: null }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return data({ error: "Please enter a valid URL", recipe: null }, { status: 400 });
  }

  try {
    const recipe = await scrapeRecipeFromUrl(url);
    return data({ error: null, recipe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import recipe";
    return data({ error: message, recipe: null }, { status: 422 });
  }
}
