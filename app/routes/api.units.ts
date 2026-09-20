/** STUB -- implementation pending. Registered so route types generate. */
import { apiRoute, assertApiAccess, jsonError, methodNotAllowedHandler } from "~/lib/api";

export const loader = apiRoute(async ({ request }: { request: Request }) => {
  assertApiAccess(request);
  return jsonError(501, "Not implemented");
});

export const action = methodNotAllowedHandler(["GET"]);
