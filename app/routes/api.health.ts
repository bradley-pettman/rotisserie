/**
 * Resource route: /api/health  (GET)
 *
 * Liveness for this service, so callers stop using GET /api/meal-plans as the
 * cheapest real read to find out whether anything is up.
 *
 * IT TOUCHES THE DATABASE. A check that only proves the Node process answered
 * is the easy half of the question -- the process happily outlives the
 * database it can no longer reach, and that is the failure a probe exists to
 * catch. `checkDatabase` does a real `SELECT 1` round trip, so an unreachable
 * Postgres shows up here as a 503 rather than as a cheerful 200.
 *
 * IT IS BEHIND `assertApiAccess`, like every other handler in this API. The
 * auth note in ~/lib/api calls that function the one choke point and says it
 * is "called as the first statement of every API loader and action"; an
 * endpoint that quietly opted out would make that invariant untrue and turn
 * every future auth audit into a hunt for exceptions. Nothing is lost locally,
 * because with INTERNAL_API_KEY unset the whole API is open anyway, and a
 * prober that runs where the key IS set can send the header -- Kubernetes
 * probes, curl and every uptime monitor support one. The alternative, an
 * unauthenticated endpoint that opens a database connection on demand, is a
 * free liveness oracle and a free way to make the pool work for anyone who can
 * reach the port. If a prober that genuinely cannot send headers ever appears,
 * the answer is a separate shallow endpoint that touches nothing, not a hole
 * in this one.
 *
 * The body is deliberately dull: whether the database answered and how long it
 * took. No version, no host, no connection string, no Postgres error text.
 */
import type { Route } from "./+types/api.health";
import { checkDatabase } from "~/db/connection";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  jsonOk,
  methodNotAllowedHandler,
} from "~/lib/api";

export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const startedAt = Date.now();
  const databaseUp = await checkDatabase();
  const latencyMs = Date.now() - startedAt;

  if (!databaseUp) {
    // 503, not 500: the service is not broken, it is unable to serve right
    // now, and that is a state a load balancer and a retrying client both know
    // what to do with.
    return jsonError(503, "Database is not reachable", {
      status: "unhealthy",
      database: "unreachable",
      latencyMs,
    });
  }

  return jsonOk({ status: "ok", database: "reachable", latencyMs });
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
