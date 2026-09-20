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
  getRecipeDetail,
  updateRecipe,
} from "~/features/recipes/queries/recipes";
import { updateRecipeSchema } from "~/features/recipes/schemas/recipe";
import {
  apiRoute,
  assertApiAccess,
  enumSearchParam,
  jsonCached,
  jsonError,
  jsonOk,
  methodNotAllowed,
  noContent,
  parseOrThrow,
  readJsonBody,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

/**
 * Opt-in response fields, the SAME vocabulary the list endpoint offers.
 *
 * That sameness is the whole point. `GET /api/recipes?include=lastCookedAt`
 * has always worked and `GET /api/recipes/:id?include=lastCookedAt` silently
 * did not -- not a 400, just a response missing the field, which is the worst
 * of the three possible answers. A client writes one `include` helper and
 * points it at both endpoints; anything less than an exact mirror here turns
 * that into a per-endpoint capability table the caller has to carry.
 *
 * Opt-in rather than always-on for the same reason as on the list: it is one
 * more query, and `getRecipeById` is the payload this endpoint has promised
 * since it shipped. A field that appears unbidden is a contract change.
 */
const INCLUDABLE_FIELDS: readonly string[] = ["lastCookedAt"];

/**
 * GET /api/recipes/:id?include=lastCookedAt
 *
 * `getRecipeDetail` is `getRecipeById` plus the one fact the recipes table
 * does not hold. Both live in the recipes module already; this route only
 * chooses between them.
 *
 * ABSENT AND NULL STAY DIFFERENT, exactly as on the list: without `include`
 * the key is not in the body at all ("you did not ask"), with it the key is
 * present and may be `null` ("never cooked"). Collapsing those two would make
 * a client unable to tell a recipe it has never cooked from a request it
 * forgot to ask the question on.
 */
export const loader = apiRoute(async ({ request, params }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Recipe");

  const include = enumSearchParam(
    new URL(request.url),
    "include",
    INCLUDABLE_FIELDS
  );

  const recipe = include.includes("lastCookedAt")
    ? await getRecipeDetail(id)
    : await getRecipeById(id);

  // Cached rather than a plain 200: a recipe is the payload a phone re-reads
  // every time the cooking screen is opened, and it changes only when someone
  // edits it. The ETag covers the body, so the two `include` variants get
  // different validators for free and cannot be confused for one another.
  return jsonCached(request, requireFound(recipe, "Recipe not found"));
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
