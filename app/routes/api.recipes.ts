/**
 * Resource route: /api/recipes  (GET list, POST create)
 *
 * No default export -- this route renders nothing, it only speaks JSON.
 * Every line here is transport: parse, delegate to the recipes query module,
 * serialize. There is no SQL and no validation logic in this file.
 */
import type { Route } from "./+types/api.recipes";
import {
  createRecipe,
  getRecipeById,
  listRecipes,
} from "~/features/recipes/queries/recipes";
import {
  createRecipeSchema,
  recipeFilterSchema,
} from "~/features/recipes/schemas/recipe";
import {
  apiRoute,
  assertApiAccess,
  csvSearchParam,
  jsonOk,
  methodNotAllowed,
  parseOrThrow,
  readJsonBody,
  requireFound,
} from "~/lib/api";

/**
 * GET /api/recipes?search=chick&tags=weeknight,vegetarian
 *
 * `tags` is ALL-OF, not any-of: a recipe is returned only if it carries every
 * listed tag. That semantic lives in `listRecipes`, not here.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const url = new URL(request.url);

  const filter = parseOrThrow(
    recipeFilterSchema,
    {
      search: url.searchParams.get("search") ?? undefined,
      tags: csvSearchParam(url, "tags"),
    },
    "Invalid query parameters"
  );

  return jsonOk(await listRecipes(filter));
});

/** POST /api/recipes -- body validated by createRecipeSchema. */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["GET", "POST"]);
  }

  const input = parseOrThrow(createRecipeSchema, await readJsonBody(request));
  const created = await createRecipe(input);

  // createRecipe returns the bare `recipes` row. Re-read through
  // getRecipeById so the 201 body carries the ingredients and tags that were
  // just written -- including their canonicalized units.
  const recipe = requireFound(await getRecipeById(created.id), "Recipe not found");

  return jsonOk(recipe, 201, { Location: `/api/recipes/${recipe.id}` });
});
