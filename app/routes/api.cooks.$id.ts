/**
 * Resource route: /api/cooks/:id  (DELETE)
 *
 * History is append-only, so there is no PATCH: a cook is a record of what was
 * actually made and the query module offers no way to rewrite one. DELETE is
 * the exception, and it is not "undo the cooking" -- it is retracting a cook
 * that was logged by mistake and therefore never happened.
 *
 * Deleting one also removes any `cook_fulfillments` row pointing at it (ON
 * DELETE CASCADE), so the plan items it fulfilled go back to unfulfilled and
 * `/adherence` re-counts them. The plan items themselves are untouched.
 *
 * No GET: `cooks.ts` has no single-cook read, only the history feed at
 * GET /api/cooks.
 */
import type { Route } from "./+types/api.cooks.$id";
import { deleteCook } from "~/features/recipes/queries/cooks";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  methodNotAllowed,
  methodNotAllowedHandler,
  noContent,
  uuidPathParam,
} from "~/lib/api";

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Cook");

  if (request.method !== "DELETE") {
    return methodNotAllowed(request, ["DELETE"]);
  }

  if (!(await deleteCook(id))) throw jsonError(404, "Cook not found");

  return noContent();
});

/** DELETE-only: a GET here must be our 405, not React Router's stack trace. */
export const loader = methodNotAllowedHandler(["DELETE"]);
