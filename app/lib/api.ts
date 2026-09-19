/**
 * Shared transport helpers for the JSON HTTP API served under `/api/*`.
 *
 * SCOPE, deliberately narrow: this module is a transport layer and nothing
 * more. It turns HTTP into calls on the existing query modules and turns their
 * results back into HTTP. It contains no SQL, no business rules and no
 * validation of its own -- validation is delegated to the Zod schemas that
 * already live in `app/features/ * /schemas`, which are the single source of
 * truth for what a valid recipe, cook or meal plan is. If something cannot be
 * expressed with those schemas and those query functions, that is a signal to
 * change them, not to bend this file.
 *
 * ENVELOPE. Every response is JSON, success and failure alike:
 *
 *   success  { "data": <payload> }                     200 / 201
 *   success  (no body at all)                          204
 *   failure  { "error": { "status", "message", "details"? } }
 *
 * `details` is present only when there is something structured to say -- for a
 * failed Zod parse it is `error.flatten().fieldErrors`, keyed by field name.
 */
import type { z } from "zod";

export interface ApiErrorBody {
  error: {
    status: number;
    message: string;
    details?: unknown;
  };
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

/** Success envelope. Use 201 on create; use `noContent()` for deletes. */
export function jsonOk<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

/** 204: deletion succeeded and there is deliberately no body to send. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/**
 * The one error constructor. It RETURNS a Response so it reads naturally both
 * as a value (`return jsonError(405, ...)`) and as a control-flow abort
 * (`throw jsonError(404, ...)`); `apiRoute` below catches the thrown form.
 */
export function jsonError(
  status: number,
  message: string,
  details?: unknown,
  headers?: HeadersInit
): Response {
  const body: ApiErrorBody = { error: { status, message } };
  if (details !== undefined) body.error.details = details;

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

/**
 * THE AUTH CHOKE POINT -- read this before relying on it.
 *
 * This is NOT a finished authentication system. There are no users, no
 * sessions, no scopes and no per-caller identity: one shared secret gates the
 * whole API, and every caller that holds it is equally trusted. It exists so
 * that when real auth arrives (OAuth client credentials, signed service
 * tokens, per-agent keys, whatever) there is exactly ONE function to replace
 * and exactly one call site per endpoint to keep honouring it, instead of an
 * auth retrofit spread across a dozen routes.
 *
 * Behaviour is intentionally two-mode:
 *   - INTERNAL_API_KEY unset  -> every request is allowed. This keeps `npm run
 *     dev` and the existing Playwright suite working with no extra setup.
 *   - INTERNAL_API_KEY set    -> the request must carry a matching `X-Api-Key`
 *     header, or it is rejected with 401.
 *
 * The consequence of mode one is that anything with network access to the dev
 * server can read and write the database. That is acceptable for local
 * development and is NOT acceptable anywhere the port is reachable by anyone
 * else: set INTERNAL_API_KEY in every deployed environment.
 *
 * The env var is read per request rather than at module load so the mode can
 * be flipped without a rebuild. The comparison is a plain `!==`, not a
 * constant-time compare -- worth revisiting alongside real auth.
 *
 * Called as the first statement of every API loader and action.
 */
export function assertApiAccess(request: Request): void {
  const expected = process.env.INTERNAL_API_KEY;

  // Unset (or empty) means "open" -- see the two-mode note above.
  if (!expected) return;

  if (request.headers.get("X-Api-Key") !== expected) {
    throw jsonError(401, "Missing or invalid X-Api-Key header");
  }
}

/**
 * Read a JSON request body. JSON only: this API is consumed by service and
 * mobile clients, not by browser form posts (the HTML routes keep doing that
 * with their own actions), so a form-encoded body is a client mistake worth
 * naming rather than quietly accepting.
 *
 * An empty body becomes `{}` so that the schema -- not this function -- gets to
 * report which fields are missing.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw jsonError(
      400,
      `Expected Content-Type: application/json, received "${contentType}"`
    );
  }

  const raw = await request.text();
  if (raw.trim() === "") return {};

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw jsonError(400, "Request body is not valid JSON");
  }
}

/**
 * Validate at the boundary with an EXISTING schema and hand back typed data.
 * Nothing unvalidated ever reaches a query function; there is no second,
 * API-local notion of what a valid payload looks like.
 */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
  message = "Request body failed validation"
): z.output<S> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const flattened = result.error.flatten();
    const details: Record<string, unknown> = { ...flattened.fieldErrors };

    // Object-level `.refine()` failures with no `path` land in formErrors and
    // would otherwise vanish from the response.
    if (flattened.formErrors.length > 0) details._form = flattened.formErrors;

    throw jsonError(400, message, details);
  }

  return result.data;
}

/**
 * A path segment that must be a UUID.
 *
 * Deliberately 404, not 400: `/api/recipes/garbage` is a URL that identifies
 * nothing, which is the same answer a well-formed id with no row behind it
 * gets. It also keeps a malformed id from reaching Postgres and coming back as
 * a 500 (`invalid input syntax for type uuid`).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidPathParam(value: string | undefined, resource: string): string {
  if (!value || !UUID_RE.test(value)) {
    throw jsonError(404, `${resource} not found`);
  }
  return value;
}

/** Turn a "query returned nothing" into a 404 instead of a null in the body. */
export function requireFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw jsonError(404, message);
  return value;
}

/**
 * A resource route's single `action` serves POST, PATCH and DELETE alike, so
 * each one dispatches on the method and ends here for anything it does not
 * implement. `Allow` is set because 405 without it is not much of an answer.
 */
export function methodNotAllowed(request: Request, allowed: string[]): Response {
  return jsonError(
    405,
    `Method ${request.method} is not allowed on this endpoint`,
    { allowed },
    { Allow: allowed.join(", ") }
  );
}

/**
 * A whole `loader` or `action` whose only job is to answer 405 in JSON.
 *
 * Needed because a resource route that exports only one of the two hands the
 * other method to React Router's internal handler, which answers with a 400
 * carrying an error message and a full stack trace -- neither our envelope nor
 * anything an API client should ever see. Every route in this API therefore
 * exports both, even when one of them only exists to say "not that method".
 */
export function methodNotAllowedHandler(allowed: string[]) {
  return async ({ request }: { request: Request }): Promise<Response> =>
    methodNotAllowed(request, allowed);
}

interface PgError {
  code: string;
  constraint?: string;
}

function asPgError(error: unknown): PgError | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" || code.length !== 5) return null;
  return {
    code,
    constraint: (error as { constraint?: string }).constraint,
  };
}

/**
 * Postgres constraint violations that are really the caller's fault. The
 * schemas cannot catch these -- a syntactically perfect UUID for a recipe that
 * does not exist only fails at INSERT time -- so they are translated here
 * rather than surfacing as a 500.
 */
const CLIENT_FAULT_SQLSTATES: Record<string, string> = {
  "23503": "Request references a row that does not exist",
  "23505": "Request conflicts with a row that already exists",
  "23514": "Request violates a database constraint",
  "22P02": "Request contains a malformed value",
  "22007": "Request contains a malformed date or time",
  "22008": "Request contains an out-of-range date or time",
};

/**
 * `requireFound` for a WRITE: the read-first version of this check does not
 * exist for every table, and even where it does it is a race -- the row can go
 * away between the check and the INSERT.
 *
 * So run the write and let Postgres be the authority. A 23503 names the
 * constraint it broke, which names the end of the relationship that was
 * missing, and `notFoundByConstraint` turns that into the 404 the caller
 * should see. Without this the generic table above would answer 400 "Request
 * references a row that does not exist" -- true, but it blames the body for
 * what is really an id in the path that identifies nothing.
 *
 * Constraint names are Postgres's own (`<table>_<column>_fkey` for the inline
 * REFERENCES in our migrations); anything not in the map is re-thrown
 * untouched, so an unforeseen violation still gets the generic treatment
 * rather than a wrong 404.
 */
export async function requireReferences<T>(
  operation: () => Promise<T>,
  notFoundByConstraint: Record<string, string>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const pgError = asPgError(error);

    if (pgError?.code === "23503" && pgError.constraint) {
      const message = notFoundByConstraint[pgError.constraint];
      if (message) throw jsonError(404, message);
    }

    throw error;
  }
}

/**
 * Wraps a loader/action so that EVERY exit is a JSON response:
 *   - a thrown Response (401/400/404 from the helpers above) is returned as-is
 *   - a caller-fault Postgres error becomes a 400
 *   - anything else becomes a 500 with a generic message, because unhandled
 *     errors must not leak SQL or stack traces to an API client
 *
 * Without this, an unexpected throw in a resource route comes back as React
 * Router's plain-text "Unexpected Server Error", which would break the promise
 * that every response in this API is JSON.
 */
export function apiRoute<A extends { request: Request }>(
  handler: (args: A) => Promise<Response>
): (args: A) => Promise<Response> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof Response) return error;

      const pgError = asPgError(error);
      if (pgError && CLIENT_FAULT_SQLSTATES[pgError.code]) {
        return jsonError(400, CLIENT_FAULT_SQLSTATES[pgError.code], {
          code: pgError.code,
          ...(pgError.constraint ? { constraint: pgError.constraint } : {}),
        });
      }

      console.error("[api] unhandled error", error);
      return jsonError(500, "Internal server error");
    }
  };
}

/** Read a bounded positive integer out of the query string. */
export function intSearchParam(
  url: URL,
  name: string,
  fallback: number,
  { min, max }: { min: number; max: number }
): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw jsonError(400, `Query parameter "${name}" must be an integer between ${min} and ${max}`, {
      [name]: [`Received "${raw}"`],
    });
  }

  return value;
}

/** `?tags=weeknight,vegetarian` -> ["weeknight", "vegetarian"]; absent/blank -> undefined. */
export function csvSearchParam(url: URL, name: string): string[] | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  return values.length > 0 ? values : undefined;
}
