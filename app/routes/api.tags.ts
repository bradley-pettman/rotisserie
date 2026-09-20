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
  jsonCached,
  methodNotAllowedHandler,
} from "~/lib/api";

/**
 * GET /api/tags
 *
 * Each row carries `recipeCount`, so "which tags are orphans?" is answerable
 * from this one response rather than from a request per tag.
 *
 * ETagged, on the argument set out at length in api.ingredients.ts: the three
 * controlled vocabularies are the best conditional-request candidates in this
 * API, because a client re-reads them on every editor open and they change
 * only when somebody introduces a name nobody has used before.
 *
 * One caveat belongs here rather than there, though, because it is specific to
 * this endpoint: `recipeCount` is part of the body, so the validator turns
 * over whenever ANY recipe is tagged, untagged or deleted -- not only when the
 * vocabulary itself moves. The 304 rate is therefore lower here than for
 * /api/ingredients or /api/units, and a busy library will see it fall further.
 * That is not a reason to drop the counts or the ETag: the counts are the
 * whole reason to call this instead of a request per tag, and a client that
 * spends one conditional round trip to learn they are unchanged has still
 * saved itself the body.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  return jsonCached(request, await getAllTags());
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
