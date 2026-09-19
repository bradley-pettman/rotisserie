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
 * `label` is required by createCookSchema, so the caller always supplies the
 * name this cook is remembered by. logCook can snapshot a recipe's name for a
 * blank label, but that path is unreachable through the schema -- see the
 * report note on this.
 */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["GET", "POST"]);
  }

  const input = parseOrThrow(createCookSchema, await readJsonBody(request));

  return jsonOk(await logCook(input), 201);
});
