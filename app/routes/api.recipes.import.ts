/**
 * Resource route: POST /api/recipes/import
 *
 * Paste a URL, get a parsed recipe back. This is the one HTTP surface in front
 * of `features/recipes/lib/scrape-recipe.ts` -- a thousand lines of hardened,
 * unit-tested, SSRF-closed parser that until now nothing in the app could
 * call. Roadmap #3 and #8 are this endpoint plus a form; an iOS Share
 * Extension is this endpoint plus forty lines of Swift.
 *
 * IT RETURNS A DRAFT AND SAVES NOTHING. That is the design decision worth
 * defending, because "import a recipe" sounds like it should create one:
 *
 *   - A scraper GUESSES. `parseIngredient` splits "2 cups flour, sifted" into
 *     a quantity, a unit, a name and a note by heuristic, and it is wrong often
 *     enough to matter. Those guesses land in shared vocabulary -- every
 *     ingredient name is upserted into the `ingredients` table that grocery
 *     aggregation reads. A bad guess written straight through is not one wrong
 *     recipe, it is a permanent row in the vocabulary everything else is
 *     matched against.
 *   - The content is ATTACKER-AUTHORED. It is whatever a third-party page put
 *     in its JSON-LD. Persisting it unreviewed means an arbitrary website can
 *     write rows into this database by being linked to once.
 *   - A draft is also what the roadmap actually asked for -- "paste a URL, get
 *     a pre-populated recipe form" -- and it is what a Share Extension wants:
 *     show the user what was found, let them fix the two fields the parser got
 *     wrong, then POST it to `/api/recipes` like any other recipe.
 *
 * So: 200 with an unsaved draft, never 201, and no `Location` header, because
 * nothing was created and there is nothing to point at.
 *
 * THE DRAFT IS NOT A `createRecipeSchema` BODY, and the difference is real
 * rather than cosmetic. `ScrapedRecipe` allows `name: null`,
 * `instructions: null` and an empty `ingredients` array -- all three of which
 * `createRecipeSchema` rejects -- and bounds none of the string lengths or the
 * quantity sign that the create schema does. A client must therefore treat the
 * response as a form to fill in, not as a payload to forward. Posting it
 * unchanged is a supported thing to attempt: `/api/recipes` answers 400 naming
 * exactly the fields that are missing, which is the right place for that
 * judgement to live. This route deliberately does NOT re-validate against
 * `createRecipeSchema` and report "complete: true/false" -- that would be a
 * second opinion about what a valid recipe is, and `~/lib/api` is explicit
 * that the schemas are the only one.
 *
 * SSRF. The guard is inside the scraper (`assertFetchableUrl`), which vets
 * every hop of every redirect, not just the first URL. Two things follow for
 * this file. First, what comes back is READABLE by the caller -- this is not a
 * blind request-forgery primitive, so the error mapping below is written to
 * leak nothing that the response body would not already have said. Second, the
 * scraper documents one hole it does not close: DNS rebinding between the
 * lookup and the connect. That is not closable from here, and it is the reason
 * this endpoint stays behind `assertApiAccess` rather than being the one
 * anonymous route in the API.
 *
 * NOT DONE HERE, and worth knowing: there is no rate limit. This is the only
 * endpoint that makes an outbound request on a caller's behalf, which makes it
 * an amplifier -- one cheap POST becomes a 10-second fetch and up to a
 * megabyte of parsing on the thread that serves every other request. The
 * scraper's own ceilings (timeout, byte cap, redirect cap) bound a SINGLE
 * import; nothing bounds a thousand of them. Whoever adds rate limiting to
 * this API should start here.
 */
import type { Route } from "./+types/api.recipes.import";
import { scrapeRecipe } from "~/features/recipes/lib/scrape-recipe";
import { importRecipeSchema } from "~/features/recipes/schemas/recipe";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  jsonOk,
  methodNotAllowed,
  methodNotAllowedHandler,
  parseOrThrow,
  readJsonBody,
} from "~/lib/api";

/**
 * The single answer for every address we decline to fetch.
 *
 * THE COLLAPSE IS THE POINT. `scrape-recipe.ts` distinguishes two cases and
 * this endpoint must not: "That address is not reachable for import." means
 * the hostname resolved to an address we refuse (loopback, RFC1918, or
 * 169.254.169.254, where every cloud serves instance credentials), while
 * "Could not find that site." means it did not resolve at all. Relaying that
 * distinction hands the caller an internal-DNS oracle: `http://jenkins.internal/`
 * answering "not reachable" and `http://nope.internal/` answering "could not
 * find" maps the private namespace one request at a time. It is an SSRF probe
 * result even though no packet was ever sent to the target, and the fact that
 * the guard worked is exactly what makes it informative.
 *
 * The cost is real and accepted: we can no longer tell someone they typo'd
 * their domain name. That is a worse error message and a much better endpoint.
 */
const ADDRESS_REFUSED =
  "That address cannot be imported from. Recipes can only be imported from a " +
  "publicly reachable http or https address.";

/**
 * How `scrapeRecipe` reports failure, mapped onto statuses that mean different
 * things to a client.
 *
 * READ THIS BEFORE TOUCHING `scrape-recipe.ts`'s STRINGS. The scraper throws
 * plain `Error`s carrying prose -- no error code, no subclass, no discriminant
 * of any kind -- so matching the message is the only way to tell "you pointed
 * me at the metadata service" from "that page has no recipe on it". That is
 * fragile, and the failure mode is quiet: reword a string over there and its
 * case stops matching here, falls through, and a perfectly ordinary refusal
 * starts answering 500 with a stack trace in the log. `api.recipes.import.test.ts`
 * exists to make that loud instead -- it reads the scraper's source, collects
 * every `throw new Error(...)` in it, and fails if any of them no longer
 * classifies. If that test fails, the fix is to update this table, not to
 * loosen the test.
 *
 * EVERY ENTRY CARRIES ITS OWN MESSAGE and none of them relays the thrown one.
 * That is not duplication for its own sake: three of the scraper's messages
 * are built with a template literal ending in `describe(error)`, which is an
 * arbitrary Node error string -- `connect ECONNREFUSED 10.0.2.15:8080`,
 * `getaddrinfo EAI_AGAIN`, a TLS chain complaint naming an internal CA. Those
 * describe OUR network, not the caller's request. Writing every outbound
 * message here means the non-leaking property is checkable by reading this
 * table rather than by auditing a thousand lines of scraper.
 *
 * The status split answers the only question a client really has, which is
 * "whose problem is this and should I retry?":
 *
 *   400  your URL. Nothing was fetched and retrying it will not help.
 *   422  we fetched it; there is no recipe in it. Type it in by hand.
 *   502  the remote site did not give us something usable. Maybe retry.
 *   504  the remote site was too slow. Retrying is reasonable.
 */
interface ImportFailure {
  /** Matched against the START of the message, since three of them are dynamic. */
  prefix: string;
  status: number;
  /** Sent to the caller verbatim. Never the scraper's own string. */
  message: string;
  /**
   * Log the original message server-side. Set only where this table throws
   * away the only diagnostic there was -- an import failing on DNS, egress
   * rules or TLS is our problem to notice, and the scrubbed 502 says nothing
   * an operator can act on. Deliberately NOT set on the 400s: those are
   * caller-triggerable at will, and logging them is a log flood with a POST
   * body behind it.
   */
  logRaw?: true;
}

const IMPORT_FAILURES: readonly ImportFailure[] = [
  // --- The caller's URL. Nothing left our network. -------------------------
  // `importRecipeSchema` rejects all three of these first, so they are only
  // reachable if the two disagree about what a URL is. Mapped anyway: the
  // scraper is a library with its own callers and may not assume our schema
  // ran, and a disagreement should surface as the 400 it is.
  {
    prefix: "That does not look like a URL.",
    status: 400,
    message: "That does not look like a URL.",
  },
  {
    prefix: "Only http and https addresses can be imported.",
    status: 400,
    message: "Only http and https addresses can be imported.",
  },
  {
    prefix: "Remove the credentials from that URL and try again.",
    status: 400,
    message: "Remove the credentials from that URL and try again.",
  },

  // --- Refused on address grounds. One answer for both. See ADDRESS_REFUSED.
  // 400 rather than 403: the caller is not forbidden from importing, this
  // particular URL is simply not one we will fetch, and that is a property of
  // what they sent us.
  {
    prefix: "That address is not reachable for import.",
    status: 400,
    message: ADDRESS_REFUSED,
  },
  { prefix: "Could not find that site.", status: 400, message: ADDRESS_REFUSED },

  // --- We asked and got nothing usable back. -------------------------------
  // 502, because this endpoint IS a gateway here: we are reporting a failure
  // of an upstream server the caller named. A 400 would blame a URL that may
  // be perfectly correct and merely down.
  {
    prefix: "That page returned ",
    status: 502,
    message: "That page did not return a recipe -- the site answered with an error.",
  },
  {
    prefix: "That page redirected too many times.",
    status: 502,
    message: "That page redirected too many times.",
  },
  {
    prefix: "That page is too large to import.",
    status: 502,
    message: "That page is too large to import.",
  },
  {
    prefix: "Could not reach that page:",
    status: 502,
    message: "That page could not be reached.",
    logRaw: true,
  },
  {
    prefix: "Could not read that page:",
    status: 502,
    message: "That page could not be read.",
    logRaw: true,
  },

  // --- We have the page. It is simply not a recipe. ------------------------
  // 422 and not 404: the URL resolved to a real document, so "not found" would
  // be false. The caller's move here is to stop retrying and type it in, which
  // is a different instruction from either of the two above.
  {
    prefix: "That page is not HTML.",
    status: 422,
    message: "That page is not HTML.",
  },
  {
    prefix: "Could not find recipe data on this page.",
    status: 422,
    message:
      "Could not find recipe data on this page. The site may not publish " +
      "structured recipe data.",
  },
];

/**
 * The one dynamic value allowed out: the HTTP status the remote page returned.
 *
 * Worth relaying because "the site said 404" and "the site said 503" are
 * different instructions to a human -- fix your link versus come back later --
 * and safe to relay because it is the status of a URL the caller chose, which
 * `assertFetchableUrl` already established resolves to a public address. It is
 * re-parsed out of the prose (the scraper formats it into the message and
 * keeps no structured copy) and narrowed to three digits, so what reaches the
 * body is a bounded integer and never the remote server's `statusText`, which
 * is a string an attacker controls.
 */
function upstreamStatus(message: string): number | undefined {
  const match = /^That page returned (\d{3})\b/.exec(message);
  return match ? Number(match[1]) : undefined;
}

/**
 * True for the rejection `AbortSignal.timeout` produces.
 *
 * A duplicate of the scraper's own `isAbortError`, which is not exported.
 * Copied rather than exported-and-shared because the two want it for opposite
 * reasons -- the scraper needs to know what NOT to rewrap, this route needs to
 * know what to call a 504 -- and because widening that module's public surface
 * to serve one status code is the worse trade. Node has used both `AbortError`
 * and `TimeoutError`, sometimes only on `error.cause`, so all three are the
 * timeout case; the timeout is the one failure that arrives with no message we
 * could have matched, because `fetchHtml` propagates it untouched.
 */
function isTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const name = (error as { name?: unknown }).name;
  if (name === "AbortError" || name === "TimeoutError") return true;

  const cause = (error as { cause?: unknown }).cause;
  return cause !== error && cause !== undefined && isTimeout(cause);
}

/**
 * Classify a scraper failure, or return `null` for one this table does not
 * know about.
 *
 * Exported for the test that reads `scrape-recipe.ts` and asserts every throw
 * in it still lands somewhere; it is not part of the route contract. React
 * Router only ever reads `loader` and `action` from a resource module.
 */
export function classifyImportFailure(error: unknown): Response | null {
  if (isTimeout(error)) {
    return jsonError(
      504,
      "That page took too long to respond. It may be worth trying again."
    );
  }

  const raw = error instanceof Error ? error.message : "";
  const failure = IMPORT_FAILURES.find((entry) => raw.startsWith(entry.prefix));

  if (!failure) return null;

  if (failure.logRaw) console.warn("[api] recipe import failed:", raw);

  const status = upstreamStatus(raw);

  return jsonError(
    failure.status,
    failure.message,
    status === undefined ? undefined : { upstreamStatus: status }
  );
}

/** POST /api/recipes/import -- body `{ "url": "https://..." }`. */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["POST"]);
  }

  const { url } = parseOrThrow(importRecipeSchema, await readJsonBody(request));

  try {
    return jsonOk(await scrapeRecipe(url));
  } catch (error) {
    const response = classifyImportFailure(error);

    // `null` means a failure this route has never heard of, which is a bug in
    // us and not a message for the caller. Rethrow so `apiRoute` logs it with
    // its stack and answers the same generic 500 every other unhandled error
    // gets -- one place that decides what a 500 looks like.
    if (response === null) throw error;

    return response;
  }
});

/**
 * GET on this path is a 405, not a scrape.
 *
 * Tempting to make it `GET /api/recipes/import?url=...`, which a Share
 * Extension could hit with no body at all -- and wrong, because GET must be
 * safe and this makes an outbound request to a caller-chosen address. A URL
 * that fetches when it is prefetched, retried, or pasted into a link preview
 * is exactly the shape of thing that turns one careless share into a hundred
 * outbound requests.
 */
export const loader = methodNotAllowedHandler(["POST"]);
