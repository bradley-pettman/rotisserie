/**
 * Resource route: /api/recipes/:id  (GET, PATCH, DELETE)
 *
 * One `action` serves both PATCH and DELETE, so it dispatches on the method
 * and answers 405 for anything else.
 */
import type { Route } from "./+types/api.recipes.$id";
import {
  deleteRecipe,
  getRecipeById,
  updateRecipe,
} from "~/features/recipes/queries/recipes";
import { updateRecipeSchema } from "~/features/recipes/schemas/recipe";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  jsonOk,
  methodNotAllowed,
  noContent,
  parseOrThrow,
  readJsonBody,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

export const loader = apiRoute(async ({ request, params }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Recipe");

  return jsonOk(requireFound(await getRecipeById(id), "Recipe not found"));
});

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Recipe");

  switch (request.method) {
    case "PATCH": {
      // The id is the one in the path; updateRecipeSchema no longer asks for a
      // copy of it in the body, and `updateRecipe` takes it separately.
      //
      // Only the fields actually present are parsed through, so an omitted
      // field is left alone and an explicit `null` clears it -- the two are
      // different requests and stay different all the way to the UPDATE.
      const fields = parseOrThrow(updateRecipeSchema, await readJsonBody(request));

      requireFound(await updateRecipe(id, fields), "Recipe not found");

      // Re-read for the same reason as on create: updateRecipe returns the
      // bare row, and a PATCH response should show the ingredients and tags.
      return jsonOk(requireFound(await getRecipeById(id), "Recipe not found"));
    }

    case "DELETE": {
      if (!(await deleteRecipe(id))) throw jsonError(404, "Recipe not found");
      return noContent();
    }

    default:
      return methodNotAllowed(request, ["GET", "PATCH", "DELETE"]);
  }
});
