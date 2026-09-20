import pg from "pg";

const { Pool } = pg;

/**
 * node-postgres hands NUMERIC/DECIMAL back as a STRING by default, because
 * NUMERIC is arbitrary precision and a JS double cannot represent all of it.
 * The cost of that default here is that a client POSTing `quantity: 6` reads
 * back `"6.00"` -- the value silently changes type on a round trip, and every
 * consumer has to remember to coerce it.
 *
 * This override is GLOBAL: it applies to every NUMERIC column in every query.
 * That is safe in this schema because `recipe_ingredients.quantity`
 * DECIMAL(10, 2) is the only NUMERIC column there is, and nothing in the app
 * relies on a string NUMERIC -- the one place aggregates are returned
 * (`plan-to-cook.ts`) casts its COUNTs to `::int`, and COUNT is int8 rather
 * than NUMERIC in any case. DECIMAL(10, 2) tops out at 99999999.99, which a
 * double represents exactly, so no precision is lost.
 *
 * NULL never reaches a type parser -- pg yields null directly -- so a null
 * quantity stays null and does not become 0.
 *
 * Adding a NUMERIC column that genuinely needs arbitrary precision (money,
 * say) means revisiting this: either drop the override and cast per query, or
 * select that column as `col::text` so it keeps its exact string form.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export type QueryParam = string | number | boolean | null | Date | string[];

export interface QueryFns {
  query: <T>(text: string, params?: QueryParam[]) => Promise<T[]>;
  queryOne: <T>(text: string, params?: QueryParam[]) => Promise<T | null>;
}

export interface DB extends QueryFns {
  withTransaction: <T>(fn: (tx: QueryFns) => Promise<T>) => Promise<T>;
}

async function query<T>(
  text: string,
  params?: QueryParam[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function queryOne<T>(
  text: string,
  params?: QueryParam[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

async function withTransaction<T>(
  fn: (tx: QueryFns) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const txQuery = async <R>(text: string, params?: QueryParam[]): Promise<R[]> => {
      const result = await client.query(text, params);
      return result.rows as R[];
    };
    const txQueryOne = async <R>(text: string, params?: QueryParam[]): Promise<R | null> => {
      const rows = await txQuery<R>(text, params);
      return rows[0] ?? null;
    };

    const result = await fn({ query: txQuery, queryOne: txQueryOne });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Liveness probe for GET /api/health.
 *
 * It lives here, in the module that owns the pool, rather than in the route:
 * routes in this app hold no SQL, and "can we reach Postgres?" is not a
 * recipes or meal-plans question, so neither feature module is its home
 * either.
 *
 * It does a real round trip. A health check that only proves the Node process
 * is running answers the easy half of the question -- the process outlives the
 * database it cannot reach, which is exactly the failure a probe exists to
 * catch. `SELECT 1` touches no table, so it stays cheap and does not depend on
 * any migration having run.
 *
 * Returns false instead of throwing: an unreachable database is a normal,
 * expected answer here, not an exceptional one, and the caller has to report
 * it either way.
 */
export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export const DB: DB = { query, queryOne, withTransaction };

export { pool };
