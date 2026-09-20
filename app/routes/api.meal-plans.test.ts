/**
 * Loader tests for /api/meal-plans, with the query module stubbed.
 *
 * There is no database here on purpose: everything below is transport
 * behaviour -- which shape comes back, which status, and whether a malformed
 * day ever reaches SQL -- and that is exactly the layer this route owns. The
 * stub also lets the `?covering=` tests assert the ARGUMENT `findPlanCovering`
 * is handed, which is where the calendar-day-versus-instant rule either holds
 * or quietly breaks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  listMealPlans: vi.fn(),
  findPlanCovering: vi.fn(),
  getMealPlanById: vi.fn(),
  createMealPlan: vi.fn(),
}));

vi.mock("~/features/meal-plans/queries/meal-plans", () => queries);

import { loader } from "./api.meal-plans";

type LoaderArgs = Parameters<typeof loader>[0];

const PLAN = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "Week of the 20th",
  startsOn: "2026-09-20",
  endsOn: "2026-09-26",
  createdAt: new Date("2026-09-19T18:00:00.000Z"),
  updatedAt: new Date("2026-09-19T18:00:00.000Z"),
};

function get(url: string, init?: RequestInit): Promise<Response> {
  return loader({ request: new Request(url, init) } as unknown as LoaderArgs);
}

beforeEach(() => {
  queries.listMealPlans.mockReset().mockResolvedValue([]);
  queries.findPlanCovering.mockReset().mockResolvedValue(null);

  // `assertApiAccess` is open when no key is configured, which is the mode
  // `npm run dev` and the Playwright suite run in. Pinned rather than assumed
  // so a developer with the variable exported does not see these fail as 401s.
  vi.stubEnv("INTERNAL_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/meal-plans", () => {
  it("lists every plan when `covering` is absent", async () => {
    queries.listMealPlans.mockResolvedValue([PLAN]);

    const response = await get("http://localhost/api/meal-plans");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(queries.findPlanCovering).not.toHaveBeenCalled();
  });
});

describe("GET /api/meal-plans?covering=", () => {
  it("returns a one-element ARRAY, not a bare object", async () => {
    queries.findPlanCovering.mockResolvedValue(PLAN);

    const response = await get("http://localhost/api/meal-plans?covering=2026-09-20");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toEqual([expect.objectContaining({ id: PLAN.id })]);
  });

  // The widget's normal answer on an unplanned day. A 404 here would be
  // indistinguishable from a bad path, and a `null` would force a second
  // decode path on a typed client.
  it("returns 200 and an empty array when no plan covers the day", async () => {
    queries.findPlanCovering.mockResolvedValue(null);

    const response = await get("http://localhost/api/meal-plans?covering=2026-09-20");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.error).toBeUndefined();
  });

  // The filtered and unfiltered reads must stay ONE decode for a typed
  // client, so both answers are arrays of the same element shape.
  it("keeps the same response shape as the unfiltered list", async () => {
    queries.listMealPlans.mockResolvedValue([PLAN]);
    queries.findPlanCovering.mockResolvedValue(PLAN);

    const listed = await (await get("http://localhost/api/meal-plans")).json();
    const covered = await (
      await get("http://localhost/api/meal-plans?covering=2026-09-20")
    ).json();

    expect(Array.isArray(listed.data)).toBe(true);
    expect(Array.isArray(covered.data)).toBe(true);
    expect(Object.keys(covered.data[0]).sort()).toEqual(Object.keys(listed.data[0]).sort());
  });

  // The day stays a STRING all the way to the query. If this ever arrives as
  // a Date, the plan for Tuesday starts being found on Monday west of UTC.
  it("hands the query layer the calendar day verbatim", async () => {
    await get("http://localhost/api/meal-plans?covering=2026-09-20");

    expect(queries.findPlanCovering).toHaveBeenCalledWith("2026-09-20");
    expect(typeof queries.findPlanCovering.mock.calls[0][0]).toBe("string");
  });

  it.each([
    ["2026-13-01", "a month that does not exist"],
    ["2026-02-30", "a day that does not exist in that month"],
    ["2026-2-3", "unpadded components"],
    ["20260920", "no separators"],
    ["20/09/2026", "a local format"],
    ["today", "a relative word"],
    ["2026-09-20T00:00:00Z", "an instant rather than a calendar day"],
    ["", "an empty value, which is a client that interpolated nothing"],
  ])("rejects %j with a 400 naming the parameter (%s)", async (value) => {
    const response = await get(
      `http://localhost/api/meal-plans?covering=${encodeURIComponent(value)}`
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain("covering");
    expect(body.error.details).toHaveProperty("covering");

    // A rejected day must not reach the database, and must never be mistaken
    // for "no filter" -- answering an empty `?covering=` with every plan ever
    // made would look like success.
    expect(queries.findPlanCovering).not.toHaveBeenCalled();
    expect(queries.listMealPlans).not.toHaveBeenCalled();
  });

  it("accepts a leap day that really exists", async () => {
    const response = await get("http://localhost/api/meal-plans?covering=2024-02-29");

    expect(response.status).toBe(200);
    expect(queries.findPlanCovering).toHaveBeenCalledWith("2024-02-29");
  });
});

describe("conditional GET", () => {
  it("answers 304 with no body when the client's ETag still matches", async () => {
    queries.listMealPlans.mockResolvedValue([PLAN]);

    const first = await get("http://localhost/api/meal-plans");
    const etag = first.headers.get("ETag");

    expect(etag).toMatch(/^W\//);

    const second = await get("http://localhost/api/meal-plans", {
      headers: { "If-None-Match": etag as string },
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("ETag")).toBe(etag);
  });

  it("answers 200 again once the collection has changed", async () => {
    queries.listMealPlans.mockResolvedValue([PLAN]);
    const etag = (await get("http://localhost/api/meal-plans")).headers.get("ETag");

    queries.listMealPlans.mockResolvedValue([{ ...PLAN, name: "Renamed" }]);
    const response = await get("http://localhost/api/meal-plans", {
      headers: { "If-None-Match": etag as string },
    });

    expect(response.status).toBe(200);
  });
});
