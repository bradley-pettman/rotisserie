/**
 * Loader tests for /api/deletions, with the query module stubbed.
 *
 * No database here, on purpose and twice over. Everything below is transport
 * behaviour -- which cursor reaches the query, which bounds hold, what the
 * envelope says -- and that is the layer this route owns. It is also the only
 * executable check available for a sync cursor: the `since` parameter is the
 * one value a client keeps between sessions, so the tests that matter are the
 * ones asserting what a malformed or absent cursor does BEFORE it becomes a
 * WHERE clause.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  listDeletions: vi.fn(),
  countDeletions: vi.fn(),
}));

vi.mock("~/db/deletions", () => queries);

import { action, loader } from "./api.deletions";

type LoaderArgs = Parameters<typeof loader>[0];

const TOMBSTONE = {
  table: "meal_plan_items" as const,
  id: "11111111-2222-4333-8444-555555555555",
  deletedAt: new Date("2026-09-20T18:00:00.000Z"),
};

function get(url: string, init?: RequestInit): Promise<Response> {
  return loader({ request: new Request(url, init) } as unknown as LoaderArgs);
}

beforeEach(() => {
  queries.listDeletions.mockReset().mockResolvedValue([]);
  queries.countDeletions.mockReset().mockResolvedValue(0);

  // `assertApiAccess` is open when no key is configured, which is the mode
  // `npm run dev` and the Playwright suite run in. Pinned rather than assumed
  // so a developer with the variable exported does not see these fail as 401s.
  vi.stubEnv("INTERNAL_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/deletions", () => {
  it("reads every tombstone on file when no cursor is supplied", async () => {
    queries.listDeletions.mockResolvedValue([TOMBSTONE]);
    queries.countDeletions.mockResolvedValue(1);

    const response = await get("http://localhost/api/deletions");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(queries.listDeletions).toHaveBeenCalledWith({
      since: undefined,
      limit: 200,
      offset: 0,
    });
    expect(queries.countDeletions).toHaveBeenCalledWith(undefined);
  });

  it("serializes deletedAt as an ISO-8601 instant a client can send back", async () => {
    queries.listDeletions.mockResolvedValue([TOMBSTONE]);

    const body = await (await get("http://localhost/api/deletions")).json();

    // The round trip is the contract: whatever `deletedAt` a client receives
    // has to be accepted verbatim as the next `?since=`.
    expect(body.data[0].deletedAt).toBe("2026-09-20T18:00:00.000Z");
    expect(
      (await get(`http://localhost/api/deletions?since=${body.data[0].deletedAt}`)).status
    ).toBe(200);
  });

  it("hands the cursor to the query as a Date, not a string", async () => {
    await get("http://localhost/api/deletions?since=2026-09-20T18:00:00.000Z");

    const { since } = queries.listDeletions.mock.calls[0][0];

    expect(since).toBeInstanceOf(Date);
    expect(since.toISOString()).toBe("2026-09-20T18:00:00.000Z");
    expect(queries.countDeletions).toHaveBeenCalledWith(since);
  });

  it("accepts a cursor carrying a UTC offset rather than Z", async () => {
    await get("http://localhost/api/deletions?since=2026-09-20T20%3A00%3A00%2B02%3A00");

    const { since } = queries.listDeletions.mock.calls[0][0];

    expect(since.toISOString()).toBe("2026-09-20T18:00:00.000Z");
  });

  it.each([
    ["2026-09-20", "a calendar day, whose midnight has no timezone"],
    ["2026-09-20 18:00:00", "a space instead of T"],
    ["1758391200", "epoch seconds"],
    ["yesterday", "a relative word"],
    ["", "an empty value, which is a client that interpolated nothing"],
  ])("rejects since=%j with a 400 naming the parameter (%s)", async (value) => {
    const response = await get(
      `http://localhost/api/deletions?since=${encodeURIComponent(value)}`
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain("since");
    expect(body.error.details).toHaveProperty("since");

    // A rejected cursor must not reach the database, and must never be read as
    // "no cursor" -- answering an empty `?since=` with the oldest page of the
    // log looks like success while telling the client nothing it asked for.
    expect(queries.listDeletions).not.toHaveBeenCalled();
    expect(queries.countDeletions).not.toHaveBeenCalled();
  });
});

describe("paging", () => {
  it("passes limit and offset through and echoes both in meta", async () => {
    queries.listDeletions.mockResolvedValue([TOMBSTONE]);
    queries.countDeletions.mockResolvedValue(412);

    const body = await (
      await get("http://localhost/api/deletions?limit=50&offset=100")
    ).json();

    expect(queries.listDeletions).toHaveBeenCalledWith({
      since: undefined,
      limit: 50,
      offset: 100,
    });

    // `total` is the size of the MATCHING SET, not of the page: that is the
    // only thing telling a client its walk is not finished.
    expect(body.meta).toEqual({ total: 412, limit: 50, offset: 100 });
  });

  it.each(["0", "501", "1.5", "-1", "many"])(
    "rejects limit=%j rather than clamping it",
    async (value) => {
      const response = await get(`http://localhost/api/deletions?limit=${value}`);

      expect(response.status).toBe(400);
      expect(queries.listDeletions).not.toHaveBeenCalled();
    }
  );

  it("rejects a negative offset", async () => {
    expect((await get("http://localhost/api/deletions?offset=-1")).status).toBe(400);
  });
});

describe("conditional GET", () => {
  it("answers 304 when the client's cursor has turned up nothing new", async () => {
    // The normal case for a polling client: an empty page for an unchanged
    // cursor, which is exactly the request worth spending no body on.
    const url = "http://localhost/api/deletions?since=2026-09-20T18:00:00.000Z";

    const first = await get(url);
    const etag = first.headers.get("ETag");

    expect(etag).toMatch(/^W\//);

    const second = await get(url, { headers: { "If-None-Match": etag as string } });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("answers 200 again once something has been deleted", async () => {
    const url = "http://localhost/api/deletions?since=2026-09-20T18:00:00.000Z";
    const etag = (await get(url)).headers.get("ETag");

    queries.listDeletions.mockResolvedValue([TOMBSTONE]);
    queries.countDeletions.mockResolvedValue(1);

    const response = await get(url, { headers: { "If-None-Match": etag as string } });

    expect(response.status).toBe(200);
  });
});

describe("other methods", () => {
  it("answers 405 in the same envelope, with Allow", async () => {
    const response = await action({
      request: new Request("http://localhost/api/deletions", { method: "DELETE" }),
    } as unknown as Parameters<typeof action>[0]);
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(body.error.status).toBe(405);
  });
});
