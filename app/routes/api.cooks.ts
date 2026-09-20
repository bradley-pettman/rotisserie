/**
 * Resource route: /api/cooks  (GET history, POST log)
 *
 * A cook is append-only fact. There is no PATCH here because the query module
 * offers no update -- rewriting history is not a supported operation.
 */
import type { Route } from "./+types/api.cooks";
import { getCookingHistory, logCook } from "~/features/recipes/queries/cooks";
import { createCookSchema } from "~/features/recipes/schemas/cook";
import {
  apiRoute,
  assertApiAccess,
  intSearchParam,
  jsonOk,
  methodNotAllowed,
  parseOrThrow,
  readJsonBody,
  requireFound,
} from "~/lib/api";

/** GET /api/cooks?days=30 -- everything cooked in the last N days, newest first. */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const days = intSearchParam(new URL(request.url), "days", 30, {
    min: 1,
    max: 3650,
  });

  return jsonOk(await getCookingHistory(days));
});

/**
 * POST /api/cooks
 *
 * `label` is optional: omit it with a `recipeId` and logCook snapshots that
 * recipe's current name into the cook, inside the insert's own transaction. A
 * client holding an id and no name can therefore log a cook without reading
 * the recipe first. Omitting both is the one combination logCook cannot serve,
 * and createCookSchema rejects it as a 400.
 */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["GET", "POST"]);
  }

  const input = parseOrThrow(createCookSchema, await readJsonBody(request));

  // `logCook` answers null when the body names a recipe that does not exist.
  // That is a 404, the same as every other "you referenced a missing row" in
  // this API -- it used to be an uncaught Error and therefore a 500.
  const cook = requireFound(await logCook(input), "Recipe not found");

  return jsonOk(cook, 201);
});
