/**
 * Loader tests for /api/meal-plans/:id, with both query modules stubbed.
 *
 * The point of most of these is not that a name comes back -- that is
 * `plan-with-recipes.ts`'s job and its own contract -- but that this route
 * routes the read to the module ALLOWED to resolve it, keeps the plain
 * response byte-identical for callers that do not ask, and does not let the
 * two variants collide on one ETag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getMealPlanById: vi.fn(),
  deleteMealPlan: vi.fn(),
}));

const integrations = vi.hoisted(() => ({
  getMealPlanWithRecipeNames: vi.fn(),
}));

vi.mock("~/features/meal-plans/queries/meal-plans", () => queries);
vi.mock("~/features/integrations/plan-with-recipes", () => integrations);

import { loader } from "./api.meal-plans.$id";

type LoaderArgs = Parameters<typeof loader>[0];

const PLAN_ID = "11111111-2222-4333-8444-555555555555";
const RECIPE_ID = "99999999-8888-4777-8666-555555555555";

const ITEM = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  mealPlanId: PLAN_ID,
  recipeId: RECIPE_ID,
  customText: null,
  plannedOn: "2026-09-22",
  mealSlot: "dinner",
  sortOrder: 0,
  notes: null,
};

const PLAN = {
  id: PLAN_ID,
  name: "Week of the 20th",
  startsOn: "2026-09-20",
  endsOn: "2026-09-26",
  createdAt: new Date("2026-09-19T18:00:00.000Z"),
  updatedAt: new Date("2026-09-19T18:00:00.000Z"),
  items: [ITEM],
};

const RESOLVED_PLAN = {
  ...PLAN,
  items: [{ ...ITEM, displayName: "Chicken tacos", recipeExists: true }],
};

function get(id: string, search = "", init?: RequestInit): Promise<Response> {
  return loader({
    request: new Request(`http://localhost/api/meal-plans/${id}${search}`, init),
    params: { id },
  } as unknown as LoaderArgs);
}

beforeEach(() => {
  queries.getMealPlanById.mockReset().mockResolvedValue(PLAN);
  integrations.getMealPlanWithRecipeNames.mockReset().mockResolvedValue(RESOLVED_PLAN);
  vi.stubEnv("INTERNAL_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/meal-plans/:id", () => {
  it("returns bare recipeIds and pays for no name query by default", async () => {
    const response = await get(PLAN_ID);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0]).not.toHaveProperty("displayName");
    expect(integrations.getMealPlanWithRecipeNames).not.toHaveBeenCalled();
  });
});

describe("GET /api/meal-plans/:id?include=recipeNames", () => {
  // The whole point of the parameter: the resolution happens in the module
  // permitted to import both features, not by the client asking again per item.
  it("resolves through the integration module, not the meal-plans module", async () => {
    await get(PLAN_ID, "?include=recipeNames");

    expect(integrations.getMealPlanWithRecipeNames).toHaveBeenCalledWith(PLAN_ID);
    expect(queries.getMealPlanById).not.toHaveBeenCalled();
  });

  // A superset, so one typed model decodes both responses.
  it("adds displayName and recipeExists without removing recipeId", async () => {
    const body = await (await get(PLAN_ID, "?include=recipeNames")).json();
    const item = body.data.items[0];

    expect(item.recipeId).toBe(RECIPE_ID);
    expect(item.displayName).toBe("Chicken tacos");
    expect(item.recipeExists).toBe(true);
    expect(body.data.startsOn).toBe("2026-09-20");
  });

  it("rejects an unknown include value rather than silently ignoring it", async () => {
    const response = await get(PLAN_ID, "?include=recipeNames,recipePhotos");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.details).toHaveProperty("include");
    expect(queries.getMealPlanById).not.toHaveBeenCalled();
    expect(integrations.getMealPlanWithRecipeNames).not.toHaveBeenCalled();
  });

  it("404s on a missing plan in both variants", async () => {
    queries.getMealPlanById.mockResolvedValue(null);
    integrations.getMealPlanWithRecipeNames.mockResolvedValue(null);

    expect((await get(PLAN_ID)).status).toBe(404);
    expect((await get(PLAN_ID, "?include=recipeNames")).status).toBe(404);
  });

  it("404s on a malformed id without touching either query module", async () => {
    const response = await get("not-a-uuid");

    expect(response.status).toBe(404);
    expect(queries.getMealPlanById).not.toHaveBeenCalled();
    expect(integrations.getMealPlanWithRecipeNames).not.toHaveBeenCalled();
  });
});

describe("conditional GET", () => {
  it("answers 304 when the client's ETag still matches", async () => {
    const first = await get(PLAN_ID);
    const etag = first.headers.get("ETag") as string;

    const second = await get(PLAN_ID, "", { headers: { "If-None-Match": etag } });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  // The hazard a validator derived from `updatedAt` would walk into: the two
  // variants share a row and a timestamp but not a body, so a shared ETag
  // would 304 a client into keeping a body it never received.
  it("gives the two include variants different validators", async () => {
    const plain = (await get(PLAN_ID)).headers.get("ETag");
    const resolved = (await get(PLAN_ID, "?include=recipeNames")).headers.get("ETag");

    expect(plain).not.toBe(resolved);

    const crossed = await get(PLAN_ID, "?include=recipeNames", {
      headers: { "If-None-Match": plain as string },
    });

    expect(crossed.status).toBe(200);
  });

  // Names resolve LIVE, so a rename changes this body without changing the
  // plan row. A content hash notices; a timestamp would not.
  it("changes the validator when a resolved name changes", async () => {
    const before = (await get(PLAN_ID, "?include=recipeNames")).headers.get("ETag");

    integrations.getMealPlanWithRecipeNames.mockResolvedValue({
      ...RESOLVED_PLAN,
      items: [{ ...ITEM, displayName: "Fish tacos", recipeExists: true }],
    });

    const after = (await get(PLAN_ID, "?include=recipeNames")).headers.get("ETag");

    expect(before).not.toBe(after);
  });
});
