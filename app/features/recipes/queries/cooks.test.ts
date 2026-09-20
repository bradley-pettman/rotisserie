import { describe, expect, it } from "vitest";

import type { QueryFns, QueryParam } from "~/db/connection";
import type { Cook } from "~/features/recipes/queries/cooks";
import { logCook, logCookWithOutcome } from "~/features/recipes/queries/cooks";
import type { MealSlot } from "~/features/recipes/schemas/cook";
import { createCookSchema } from "~/features/recipes/schemas/cook";

/**
 * These tests run against a fake `QueryFns` rather than Postgres, which is
 * what lets them live in the unit suite at all. `tx` is passed explicitly on
 * every call for the same reason: it is the seam that keeps `DB` -- and
 * therefore a real connection -- out of the test, and it exercises the branch
 * a caller inside an existing transaction takes.
 *
 * What the fake models is narrow and deliberate: a `cooks` table keyed on its
 * primary key, and `ON CONFLICT (id) DO NOTHING` returning ZERO ROWS on a
 * conflict. That one behaviour is the whole trap this change exists to handle,
 * and it is invisible to a test that only asserts on the value returned.
 */
const COOK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COOK_ID = "33333333-3333-4333-8333-333333333333";
const RECIPE_ID = "22222222-2222-4222-8222-222222222222";

interface FakeDb extends QueryFns {
  /** Every statement issued, in order, so the SQL itself can be asserted on. */
  statements: string[];
  /** The `cooks` table, keyed by id. */
  rows: Map<string, Cook>;
}

function toCook(id: string, values: QueryParam[]): Cook {
  const [recipeId, label, cookedOn, mealSlot, servingsMade, notes, isLeftovers] = values;

  return {
    id,
    recipeId: recipeId as string | null,
    label: label as string,
    cookedOn: cookedOn as string,
    mealSlot: mealSlot as MealSlot,
    servingsMade: servingsMade as number | null,
    notes: notes as string | null,
    isLeftovers: isLeftovers as boolean,
    createdAt: new Date("2026-09-20T18:00:00.000Z"),
  };
}

function fakeDb(seed: { recipes?: Record<string, string>; cooks?: Cook[] } = {}): FakeDb {
  const recipes = new Map(Object.entries(seed.recipes ?? {}));
  const rows = new Map((seed.cooks ?? []).map((cook) => [cook.id, cook]));
  const statements: string[] = [];
  let generated = 0;

  const query = async <T>(text: string, params: QueryParam[] = []): Promise<T[]> => {
    statements.push(text);

    if (text.includes("SELECT name FROM recipes")) {
      const name = recipes.get(String(params[0]));
      return (name === undefined ? [] : [{ name }]) as T[];
    }

    if (/FROM cooks WHERE id/.test(text)) {
      const row = rows.get(String(params[0]));
      return (row === undefined ? [] : [row]) as T[];
    }

    if (text.includes("INSERT INTO cooks (id,")) {
      const id = String(params[0]);
      // ON CONFLICT (id) DO NOTHING: no row inserted AND no row returned.
      if (rows.has(id)) return [] as T[];

      const row = toCook(id, params.slice(1));
      rows.set(id, row);
      return [row] as T[];
    }

    if (text.includes("INSERT INTO cooks (recipe_id,")) {
      // Stands in for the column DEFAULT gen_random_uuid().
      const id = `44444444-4444-4444-8444-${String(++generated).padStart(12, "0")}`;
      const row = toCook(id, params);
      rows.set(id, row);
      return [row] as T[];
    }

    throw new Error(`fakeDb: unrecognised statement\n${text}`);
  };

  const queryOne = async <T>(text: string, params?: QueryParam[]): Promise<T | null> =>
    (await query<T>(text, params))[0] ?? null;

  return { query, queryOne, statements, rows };
}

/** Inputs are built through the real schema, so defaults and coercion are the shipped ones. */
const cookInput = (overrides: Record<string, unknown> = {}) =>
  createCookSchema.parse({ label: "Tacos", cookedOn: "2026-09-20", ...overrides });

describe("createCookSchema.id", () => {
  it("defaults to null when absent, which is the server-generates-it path", () => {
    expect(cookInput().id).toBeNull();
  });

  it("accepts an explicit null for a client that always sends the key", () => {
    expect(cookInput({ id: null }).id).toBeNull();
  });

  it("carries a supplied uuid through", () => {
    expect(cookInput({ id: COOK_ID }).id).toBe(COOK_ID);
  });

  it("rejects an id that is not a uuid, rather than letting Postgres 22P02 it", () => {
    const result = createCookSchema.safeParse({
      label: "Tacos",
      cookedOn: "2026-09-20",
      id: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });
});

describe("logCookWithOutcome without a client id", () => {
  it("issues the unconditional insert, with no ON CONFLICT clause", async () => {
    const db = fakeDb();

    const result = await logCookWithOutcome(cookInput(), db);

    expect(result?.created).toBe(true);
    expect(result?.cook.label).toBe("Tacos");
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]).toContain("INSERT INTO cooks (recipe_id,");
    expect(db.statements[0]).not.toContain("ON CONFLICT");
  });

  it("still snapshots the recipe name when the label is blank", async () => {
    const db = fakeDb({ recipes: { [RECIPE_ID]: "Ragu" } });

    const result = await logCookWithOutcome(
      cookInput({ label: "", recipeId: RECIPE_ID }),
      db
    );

    expect(result?.cook.label).toBe("Ragu");
    expect(result?.created).toBe(true);
  });

  it("answers null when the recipe to snapshot from does not exist", async () => {
    const db = fakeDb();

    expect(await logCookWithOutcome(cookInput({ label: "", recipeId: RECIPE_ID }), db))
      .toBeNull();
  });
});

describe("logCookWithOutcome with a client id", () => {
  it("writes the row under the supplied id and reports it created", async () => {
    const db = fakeDb();

    const result = await logCookWithOutcome(cookInput({ id: COOK_ID }), db);

    expect(result).toEqual({
      cook: expect.objectContaining({ id: COOK_ID, label: "Tacos" }),
      created: true,
    });
    expect(db.statements[0]).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("collapses a retry onto the original row instead of appending a second cook", async () => {
    const db = fakeDb();
    const input = cookInput({ id: COOK_ID });

    const first = await logCookWithOutcome(input, db);
    const retry = await logCookWithOutcome(input, db);

    expect(first?.created).toBe(true);
    expect(retry?.created).toBe(false);
    expect(retry?.cook).toEqual(first?.cook);
    // The point of the whole exercise: one cook, not two.
    expect(db.rows.size).toBe(1);
  });

  it("reads the row back after ON CONFLICT swallowed the RETURNING clause", async () => {
    const db = fakeDb({
      cooks: [toCook(COOK_ID, [null, "Tacos", "2026-09-20", "dinner", 2, null, false])],
    });

    await logCookWithOutcome(cookInput({ id: COOK_ID }), db);

    // Insert first, then the follow-up SELECT -- without the second statement
    // a conflict is indistinguishable from a failed insert.
    expect(db.statements).toHaveLength(2);
    expect(db.statements[1]).toContain("FROM cooks WHERE id");
  });

  it("replays the ORIGINAL row when a reused id arrives with a different body", async () => {
    const db = fakeDb();

    await logCookWithOutcome(cookInput({ id: COOK_ID, label: "Tacos" }), db);
    const retry = await logCookWithOutcome(
      cookInput({ id: COOK_ID, label: "Lasagne", servingsMade: 9 }),
      db
    );

    expect(retry?.created).toBe(false);
    expect(retry?.cook.label).toBe("Tacos");
    // Nothing was overwritten: append-only history stays what it was.
    expect(db.rows.get(COOK_ID)?.label).toBe("Tacos");
    expect(db.rows.get(COOK_ID)?.servingsMade).toBeNull();
  });

  it("replays a stored cook whose recipe has since been deleted", async () => {
    // The snapshot path with no recipe to snapshot from, but the id is already
    // in the table: a cook outlives the recipe it was made from, so this is a
    // replay rather than the 404 a first attempt would deserve.
    const db = fakeDb({
      cooks: [toCook(COOK_ID, [RECIPE_ID, "Ragu", "2026-09-20", "dinner", 4, null, false])],
    });

    const result = await logCookWithOutcome(
      cookInput({ id: COOK_ID, label: "", recipeId: RECIPE_ID }),
      db
    );

    expect(result?.created).toBe(false);
    expect(result?.cook.label).toBe("Ragu");
  });

  it("still answers null for a missing recipe when the id is not stored either", async () => {
    const db = fakeDb();

    expect(
      await logCookWithOutcome(
        cookInput({ id: OTHER_COOK_ID, label: "", recipeId: RECIPE_ID }),
        db
      )
    ).toBeNull();
  });

  it("throws when the row is neither inserted nor readable back", async () => {
    // Nothing inserted and nothing found: a concurrent uncommitted insert of
    // the same id, or a DELETE landing between the two statements. There is no
    // row to answer with, so it must not invent one.
    const blind: QueryFns = {
      query: async () => [],
      queryOne: async () => null,
    };

    await expect(logCookWithOutcome(cookInput({ id: COOK_ID }), blind)).rejects.toThrow(
      "Failed to log cook"
    );
  });
});

describe("logCook", () => {
  it("hands back the row alone, dropping the created/replayed distinction", async () => {
    const db = fakeDb();
    const input = cookInput({ id: COOK_ID });

    expect((await logCook(input, db))?.id).toBe(COOK_ID);
    // A retry through this form is still a replay, not a second row.
    expect((await logCook(input, db))?.id).toBe(COOK_ID);
    expect(db.rows.size).toBe(1);
  });

  it("keeps answering null for a recipe that does not exist", async () => {
    const db = fakeDb();

    expect(await logCook(cookInput({ label: "", recipeId: RECIPE_ID }), db)).toBeNull();
  });
});
