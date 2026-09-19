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
      const body = await readJsonBody(request);

      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw jsonError(400, "Request body must be a JSON object");
      }

      // updateRecipeSchema demands `id` inside the payload (it was written for
      // a form post that carried it in a hidden field). For this API the id is
      // in the path, so it is merged in here rather than asked of the caller
      // twice -- and then dropped, because updateRecipe takes it separately.
      const { id: _fromPath, ...fields } = parseOrThrow(updateRecipeSchema, {
        ...body,
        id,
      });

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
