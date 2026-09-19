/**
 * Resource route: /api/tags/:id  (DELETE)
 *
 * WHY THIS EXISTS. Deleting a recipe cascades its `recipe_tags` rows but
 * leaves the `tags` rows standing, so the vocabulary accumulates tags nothing
 * uses. That is not cosmetic: `getAllTags` drives the filter chips on the
 * recipe list, so every orphan is a chip that matches nothing, and a client
 * had no way at all to remove one.
 *
 * WHY A DELETE ENDPOINT RATHER THAN GARBAGE COLLECTION. Collecting
 * unreferenced tags automatically when a recipe is deleted would make an
 * unrelated operation silently destroy vocabulary -- delete your only
 * "vegetarian" recipe and the tag you curated is gone, to be retyped later. It
 * also puts extra work on the delete path and would race with a concurrent
 * request tagging another recipe with the same word. Tidying the vocabulary is
 * its own intent, so it gets its own request.
 *
 * WHY ONE ID AT A TIME. There is no bulk sweep here on purpose: `tests/db.ts`
 * records that the app "deliberately exposes no bulk-delete endpoint, and must
 * never grow one again". A client finds the orphans from `recipeCount` in
 * GET /api/tags and deletes the ones it means to.
 */
import type { Route } from "./+types/api.tags.$id";
import { deleteUnreferencedTag } from "~/features/recipes/queries/recipes";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  methodNotAllowed,
  methodNotAllowedHandler,
  noContent,
  uuidPathParam,
} from "~/lib/api";

/** There is no single-tag read; the vocabulary is served whole by GET /api/tags. */
export const loader = methodNotAllowedHandler(["DELETE"]);

/**
 * DELETE /api/tags/:id
 *
 *   204  the tag was unreferenced and is gone
 *   404  no tag with that id
 *   409  the tag is still on at least one recipe
 *
 * 409 rather than a cascade: `recipe_tags.tag_id` is ON DELETE CASCADE, so
 * deleting a live tag would strip it off every recipe carrying it -- a
 * vocabulary tidy-up that quietly edits recipes. Conflict is the honest
 * answer, because the request is well formed and it is the current state that
 * forbids it; the caller untags the recipes first if that is really the
 * intent. The check and the delete are one transaction in
 * `deleteUnreferencedTag`, so the answer cannot go stale between them.
 */
export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Tag");

  if (request.method !== "DELETE") {
    return methodNotAllowed(request, ["DELETE"]);
  }

  const outcome = await deleteUnreferencedTag(id);

  if (outcome === "not-found") return jsonError(404, "Tag not found");

  if (outcome === "in-use") {
    return jsonError(
      409,
      "Tag is still applied to at least one recipe",
      { tag: ["Remove the tag from every recipe that carries it, then delete it"] }
    );
  }

  return noContent();
});
