import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Route } from "./+types/api.recipes.import";
import { action, classifyImportFailure } from "./api.recipes.import";

/**
 * DNS is stubbed for the whole file, the same way `scrape-recipe.test.ts` does
 * it: `assertFetchableUrl` resolves a hostname before fetching it, and that is
 * a real network call. It answers with a public address so the guard lets the
 * request through -- the guard itself is exercised by classification above,
 * not by trying to reach anything.
 */
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

/**
 * These tests are about ONE fragility and one promise.
 *
 * The fragility: `scrapeRecipe` signals failure with plain `Error`s carrying
 * prose, so the route classifies them by matching the message. Reword a string
 * in `scrape-recipe.ts` and its case silently stops matching -- a refusal that
 * should be a 400 becomes a 500 with a stack trace in the log, and nothing
 * fails until someone notices in production.
 *
 * The promise: nothing the scraper learned about our network reaches the
 * caller. Three of its messages end in an arbitrary Node error string, and two
 * of its refusals differ only in a way that would tell a caller which private
 * hostnames exist.
 *
 * Neither needs a database and neither touches the network: every case is
 * constructed from an `Error` the scraper is known to throw.
 */

async function bodyOf(response: Response): Promise<{
  error: { status: number; message: string; details?: unknown };
}> {
  return response.json();
}

/** Classify, asserting the failure was recognised at all. */
async function classify(error: unknown) {
  const response = classifyImportFailure(error);
  expect(response, "failure was not recognised by the route").not.toBeNull();

  return { status: response!.status, body: await bodyOf(response!) };
}

describe("every failure scrape-recipe.ts can throw is classified", () => {
  /**
   * Read the scraper's SOURCE and collect the messages it throws, rather than
   * listing them here by hand -- a hand-kept list is the same thing the route's
   * table already is, and two copies of it would drift together and pass.
   *
   * Two forms exist: string and template literals (three of which continue into
   * a `${...}`, so only the static prefix is taken, which is exactly what the
   * route matches on), and `throw new Error(SOME_CONSTANT)`, resolved against
   * the `const NAME = "..."` declarations in the same file.
   */
  const source = readFileSync(
    new URL("../features/recipes/lib/scrape-recipe.ts", import.meta.url),
    "utf8"
  );

  const constants = new Map(
    [...source.matchAll(/^const ([A-Z][A-Z0-9_]*) = "((?:[^"\\]|\\.)*)";$/gm)].map(
      (match) => [match[1], match[2]] as const
    )
  );

  const thrown = [
    ...[...source.matchAll(/throw new Error\(\s*["`]([^"`$]*)/g)].map(
      (match) => match[1]
    ),
    ...[...source.matchAll(/throw new Error\(\s*([A-Z][A-Z0-9_]*)\s*\)/g)].map(
      (match) => constants.get(match[1])
    ),
  ].filter((message): message is string => typeof message === "string");

  const messages = [...new Set(thrown)];

  /**
   * The guard on the guard. If the extraction above ever silently matches
   * nothing -- a refactor to a thrown subclass, a renamed constant -- every
   * `it.each` below would vacuously pass and this file would go on reporting
   * success while checking nothing at all.
   */
  it("found the scraper's throw sites", () => {
    expect(messages.length).toBeGreaterThanOrEqual(10);
    expect(messages).toContain("Could not find recipe data on this page.");
  });

  it.each(messages)("classifies %j", async (message) => {
    const { status } = await classify(new Error(message));

    // Anything in the 4xx/5xx range EXCEPT the generic 500, which is what an
    // unrecognised failure would produce.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).not.toBe(500);
  });
});

describe("SSRF refusals are indistinguishable", () => {
  /**
   * The scraper knows the difference between "resolved to an address we
   * refuse" and "did not resolve"; the API must not. Telling them apart turns
   * this endpoint into a map of the private namespace: a name that answers
   * "refused" exists, a name that answers "not found" does not.
   */
  it("answers identically for a blocked address and a name that does not resolve", async () => {
    const blocked = await classify(
      new Error("That address is not reachable for import.")
    );
    const unresolvable = await classify(new Error("Could not find that site."));

    expect(blocked.status).toBe(400);
    expect(unresolvable).toEqual(blocked);
  });
});

describe("nothing about our network reaches the caller", () => {
  it.each([
    "Could not reach that page: connect ECONNREFUSED 10.0.2.15:8080",
    "Could not reach that page: getaddrinfo EAI_AGAIN vault.internal",
    "Could not read that page: unable to verify the first certificate",
  ])("scrubs the underlying error from %j", async (message) => {
    const { status, body } = await classify(new Error(message));

    expect(status).toBe(502);

    // The whole body, not just the message: a tail that leaked into `details`
    // would be just as readable.
    const serialised = JSON.stringify(body);
    for (const fragment of [
      "ECONNREFUSED",
      "10.0.2.15",
      "EAI_AGAIN",
      "vault.internal",
      "certificate",
    ]) {
      expect(serialised).not.toContain(fragment);
    }
  });

  it("relays the upstream status as a number, never the remote statusText", async () => {
    const { status, body } = await classify(
      new Error("That page returned 404 Not Found.")
    );

    expect(status).toBe(502);
    expect(body.error.details).toEqual({ upstreamStatus: 404 });
    // `statusText` is a string the remote server chooses. It must not appear.
    expect(JSON.stringify(body)).not.toContain("Not Found");
  });

  it("omits details when the message carries no upstream status", async () => {
    const { body } = await classify(new Error("That page is not HTML."));

    expect(body.error.details).toBeUndefined();
  });
});

describe("status codes distinguish whose problem it is", () => {
  it("answers 422 for a page with no recipe in it", async () => {
    // Fetched fine, parsed fine, simply is not a recipe -- the caller should
    // stop retrying, which is what separates this from the 502s.
    const { status } = await classify(
      new Error("Could not find recipe data on this page.")
    );

    expect(status).toBe(422);
  });

  it("answers 502 when the remote site failed us", async () => {
    const { status } = await classify(
      new Error("That page redirected too many times.")
    );

    expect(status).toBe(502);
  });

  it("answers 400 for a URL with credentials in it", async () => {
    const { status } = await classify(
      new Error("Remove the credentials from that URL and try again.")
    );

    expect(status).toBe(400);
  });

  /**
   * The timeout is the one failure with no message to match: `fetchHtml`
   * propagates the abort untouched so callers can branch on `error.name`, and
   * Node has spelled that name three different ways across releases.
   */
  it.each([
    ["AbortError on the error itself", Object.assign(new Error("aborted"), { name: "AbortError" })],
    ["TimeoutError on the error itself", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
    [
      "TimeoutError on the cause",
      Object.assign(new Error("fetch failed"), {
        cause: Object.assign(new Error("inner"), { name: "TimeoutError" }),
      }),
    ],
  ])("answers 504 for a timeout (%s)", async (_label, error) => {
    const { status } = await classify(error);

    expect(status).toBe(504);
  });
});

/**
 * The endpoint end to end, with only the network faked. Everything else is the
 * real path: `readJsonBody`'s Content-Type check, `importRecipeSchema`, the
 * scraper, and the mapping above.
 */
describe("POST /api/recipes/import", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function respondWith(html: string, status = 200): void {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      headers: { get: () => null },
      text: async () => html,
    });
  }

  /** Invoke the real action with a real Request. */
  function post(body: unknown, contentType = "application/json") {
    return action({
      request: new Request("https://rotisserie.test/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    } as unknown as Route.ActionArgs);
  }

  const PAGE = `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Brown Butter Banana Bread",
      prepTime: "PT15M",
      cookTime: "PT1H",
      recipeYield: "10 slices",
      recipeIngredient: ["3 ripe bananas, mashed", "2 cups flour"],
      recipeInstructions: ["Mash the bananas.", "Bake."],
    })}</script></head><body></body></html>`;

  it("returns a parsed draft", async () => {
    respondWith(PAGE);

    const response = await post({ url: "https://example.com/banana-bread" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      name: "Brown Butter Banana Bread",
      prepTimeMinutes: 15,
      cookTimeMinutes: 60,
      servings: 10,
      sourceUrl: "https://example.com/banana-bread",
    });
    expect(body.data.ingredients[0]).toMatchObject({
      ingredientName: "ripe bananas",
      quantity: 3,
    });
  });

  /**
   * 200 and not 201, and no Location header: this endpoint parses, it does not
   * persist. If either of those ever changes, a scraper's guesses have started
   * entering the library without anyone reviewing them.
   */
  it("does not claim to have created anything", async () => {
    respondWith(PAGE);

    const response = await post({ url: "https://example.com/banana-bread" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("refuses a non-http(s) url before any fetch happens", async () => {
    const response = await post({ url: "data:text/html,<html></html>" });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a page with no recipe on it to 422", async () => {
    respondWith("<!doctype html><html><body><p>no recipe here</p></body></html>");

    const response = await post({ url: "https://example.com/blog" });

    expect(response.status).toBe(422);
  });

  it("maps an upstream error status to 502 with the status attached", async () => {
    respondWith("<html></html>", 503);

    const response = await post({ url: "https://example.com/gone" });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.details).toEqual({ upstreamStatus: 503 });
  });

  it("requires a JSON content type", async () => {
    const response = await post({ url: "https://example.com/x" }, "text/plain");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 405 for a method that is not POST", async () => {
    const response = await action({
      request: new Request("https://rotisserie.test/api/recipes/import", {
        method: "DELETE",
      }),
    } as unknown as Route.ActionArgs);

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});

describe("an unrecognised failure is not classified", () => {
  /**
   * `null` is how the route says "this is a bug in us" -- it rethrows, and
   * `apiRoute` logs the stack and answers a generic 500. Swallowing an unknown
   * error into some plausible 4xx would hide real parser bugs behind a status
   * that tells the caller to change their request.
   */
  it.each([
    new Error("Cannot read properties of undefined (reading 'slice')"),
    new TypeError("x is not a function"),
    "not an Error at all",
    null,
  ])("returns null for %j", (error) => {
    expect(classifyImportFailure(error)).toBeNull();
  });
});
