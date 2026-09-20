/**
 * Resource route: /api/tags  (GET)
 *
 * The tag vocabulary, so a client can offer valid values for
 * `GET /api/recipes?tags=` instead of guessing, and can see which tags nothing
 * uses any more.
 *
 * GET only, deliberately. Tags are created by tagging a recipe -- `createRecipe`
 * and `updateRecipe` upsert them from the recipe's own `tags` array. A bare
 * POST /api/tags could only ever produce a tag attached to nothing, which is
 * precisely the orphan DELETE /api/tags/:id exists to clean up; the API should
 * not ship a way to manufacture the mess it also ships a broom for.
 */
import type { Route } from "./+types/api.tags";
import { getAllTags } from "~/features/recipes/queries/recipes";
import {
  apiRoute,
  assertApiAccess,
  jsonOk,
  methodNotAllowedHandler,
} from "~/lib/api";

/**
 * GET /api/tags
 *
 * Each row carries `recipeCount`, so "which tags are orphans?" is answerable
 * from this one response rather than from a request per tag.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  return jsonOk(await getAllTags());
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
