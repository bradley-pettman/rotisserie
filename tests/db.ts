/**
 * Direct database access for the E2E suite.
 *
 * The suite drives the app through a browser, so the rows a test creates are
 * inserted by the *app*, not by the test. Cleaning them up therefore has to
 * happen out-of-band, from the test process, straight over `pg` — the app
 * deliberately exposes no bulk-delete endpoint, and must never grow one again.
 *
 * Two rules shape everything below:
 *
 *   1. Delete only what this run created. Every delete is scoped either to an
 *      id the suite recorded, to this run's unique name marker, or to
 *      `created_at > <the run's start>`. The seeded `ingredients` and `units`
 *      rows predate every run, so no query here can reach them — they are
 *      shared fixtures the tests select from.
 *   2. Never delete a row something still points at. Tags and ingredients that
 *      a surviving recipe references are left alone.
 *
 * This matters more than it looks: the dev database is shared, and rows that
 * are not ours (another developer's, another agent's) sit in these same tables.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Matches .env.example and docker-compose.yml. */
const DEFAULT_DATABASE_URL =
  "postgres://postgres:postgres@localhost:5432/rotisserie_dev?sslmode=disable";

/**
 * Same precedence as `db/seed.mjs`: an exported DATABASE_URL wins, then a local
 * `.env`, then the compose default. CI only has to export DATABASE_URL.
 * `playwright.config.ts` hands the resolved value to the dev server it starts,
 * so the browser and the test process always talk to the same database.
 */
function resolveDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    const envFile = join(REPO_ROOT, ".env");
    if (existsSync(envFile)) {
      try {
        process.loadEnvFile(envFile);
      } catch {
        // Unreadable or malformed .env — fall through to the default.
      }
    }
  }
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export const DATABASE_URL = resolveDatabaseUrl();

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    // Small pool: one worker, short-lived queries between tests.
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  }
  return pool;
}

async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params as unknown[]);
  return result.rows as T[];
}

export async function closeDb(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

export interface TestRun {
  /**
   * Unique, lowercase-alphanumeric marker embedded in every recipe and tag name
   * the suite creates. It is the safety net for rows whose id was never
   * recorded — a test that died between "Save Recipe" and the redirect.
   * Alphanumeric because it also has to survive being pasted into a tag name,
   * a `data-testid` and a URL-matching regex.
   */
  marker: string;
  /**
   * The database clock immediately before the first test. Read from the server,
   * not from this process, so a clock skew between the two cannot widen the
   * window and put somebody else's rows inside it.
   */
  startedAt: string;
}

export async function beginRun(marker: string): Promise<TestRun> {
  const rows = await query<{ now: string }>("SELECT now()::text AS now");
  const startedAt = rows[0]?.now;
  if (!startedAt) throw new Error("Could not read the database clock");

  // Fail loudly and early rather than letting every test fail on a blank page.
  const [seeds] = await query<{ ingredients: string; units: string }>(
    `SELECT (SELECT count(*) FROM ingredients)::text AS ingredients,
            (SELECT count(*) FROM units)::text AS units`
  );
  if (Number(seeds.ingredients) === 0 || Number(seeds.units) === 0) {
    throw new Error(
      "The E2E database has no seeded ingredients/units. Run `dbmate up && npm run db:seed` first."
    );
  }

  return { marker, startedAt };
}

/**
 * Delete the recipes this run created, by id and by marker, and the `cooks`
 * rows that belong to them.
 *
 * `recipes` cascades to `recipe_ingredients` and `recipe_tags`, so those need
 * no handling. `cooks.recipe_id` is ON DELETE SET NULL by design (deleting a
 * recipe must not erase the history of having cooked it), which means a cook
 * would *survive* as a label-only orphan — so cooks go first, explicitly.
 */
export async function deleteRecipes(run: TestRun, ids: string[]): Promise<number> {
  const targets = await query<{ id: string }>(
    `SELECT id FROM recipes
      WHERE id = ANY($1::uuid[])
         OR name LIKE '%' || $2 || '%'`,
    [ids, run.marker]
  );
  if (targets.length === 0) return 0;

  const targetIds = targets.map((row) => row.id);

  // `label` snapshots the recipe name, so it carries the marker too — that
  // catches a cook whose recipe was already deleted by the test itself.
  await query(
    `DELETE FROM cooks
      WHERE recipe_id = ANY($1::uuid[])
         OR label LIKE '%' || $2 || '%'`,
    [targetIds, run.marker]
  );
  await query(`DELETE FROM recipes WHERE id = ANY($1::uuid[])`, [targetIds]);

  return targetIds.length;
}

export interface SweepResult {
  tags: number;
  ingredients: number;
  units: number;
}

/**
 * Delete lookup rows the app created while the suite was running and that no
 * surviving recipe references any more.
 *
 * The app upserts an `ingredients` row (capitalized) and possibly a `units` row
 * for every ingredient line of a saved recipe, plus a `tags` row per tag. Those
 * outlive the recipe, so deleting the recipe is not enough. An unreferenced row
 * created inside the run window can only be the leftover of a recipe that has
 * just been deleted — nothing else creates one.
 *
 * `created_at > run.startedAt` is what keeps the seeded 218 ingredients and 32
 * units safe: they were inserted long before the run began.
 */
export async function sweepOrphans(run: TestRun): Promise<SweepResult> {
  const tags = await query<{ id: string }>(
    `DELETE FROM tags t
      WHERE t.created_at > $1::timestamptz
        AND NOT EXISTS (SELECT 1 FROM recipe_tags rt WHERE rt.tag_id = t.id)
      RETURNING t.id`,
    [run.startedAt]
  );
  const ingredients = await query<{ id: string }>(
    `DELETE FROM ingredients i
      WHERE i.created_at > $1::timestamptz
        AND NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.ingredient_id = i.id)
      RETURNING i.id`,
    [run.startedAt]
  );
  const units = await query<{ id: string }>(
    `DELETE FROM units u
      WHERE u.created_at > $1::timestamptz
        AND NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.unit_id = u.id)
      RETURNING u.id`,
    [run.startedAt]
  );

  return { tags: tags.length, ingredients: ingredients.length, units: units.length };
}

/**
 * Rows created during the run that are still there after the final teardown.
 * Reported, not asserted: the dev database is shared, so a non-zero count is
 * not necessarily this suite's doing.
 */
export async function residueSince(run: TestRun): Promise<Record<string, number>> {
  const rows = await query<{ table_name: string; count: string }>(
    `SELECT 'recipes' AS table_name, count(*)::text FROM recipes WHERE created_at > $1::timestamptz
     UNION ALL SELECT 'tags', count(*)::text FROM tags WHERE created_at > $1::timestamptz
     UNION ALL SELECT 'ingredients', count(*)::text FROM ingredients WHERE created_at > $1::timestamptz
     UNION ALL SELECT 'units', count(*)::text FROM units WHERE created_at > $1::timestamptz
     UNION ALL SELECT 'cooks', count(*)::text FROM cooks WHERE created_at > $1::timestamptz`,
    [run.startedAt]
  );

  return Object.fromEntries(
    rows.filter((row) => Number(row.count) > 0).map((row) => [row.table_name, Number(row.count)])
  );
}
