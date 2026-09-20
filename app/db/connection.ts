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

/** Read a positive-integer knob from the environment, falling back when unset or junk. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * The pool's defaults are all "wait forever", which is the wrong answer for
 * every one of them under load:
 *
 * - `connectionTimeoutMillis: 0` queues a request for a connection with no
 *   deadline. Once `max` slots are busy, every further request piles up
 *   invisibly instead of failing fast, including the one from `checkDatabase`
 *   below -- so the liveness probe stops answering at exactly the moment it
 *   has something to report, and a load balancer cannot take the instance out
 *   of rotation. A bounded wait converts that silent pile-up into a 500 the
 *   caller can see and the probe can outrun.
 * - No `statement_timeout` lets one pathological query hold a slot forever.
 *   Postgres enforces this server-side, so it covers the query even if the
 *   Node process stops waiting on it.
 * - `idleTimeoutMillis` returns unused connections to Postgres rather than
 *   holding `max` of them open against a shared server.
 *
 * All four are env-tunable because the right numbers depend on the deployment
 * (a serverless runtime wants a much smaller `max` than a long-lived server),
 * and a deploy should not need a rebuild to change them.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: envInt("PGPOOL_MAX", 10),
  connectionTimeoutMillis: envInt("PGPOOL_CONNECTION_TIMEOUT_MS", 5_000),
  idleTimeoutMillis: envInt("PGPOOL_IDLE_TIMEOUT_MS", 30_000),
  statement_timeout: envInt("PGPOOL_STATEMENT_TIMEOUT_MS", 10_000),
});

/**
 * REQUIRED, not optional logging: `Pool` is an EventEmitter, and Node throws an
 * `error` event that has no listener as an uncaught exception. pg re-emits
 * errors from clients sitting IDLE in the pool here -- which is what a Postgres
 * restart, a failover, an OOM kill, a `pg_terminate_backend()`, or a NAT/
 * pgbouncer idle timeout all look like from this side. Without this line the
 * first such blip takes the whole server process down, in-flight requests and
 * all, for a condition the pool would otherwise recover from on its own by
 * discarding the dead client.
 *
 * There is nothing to do but log: the failed client is already being removed,
 * and the next `connect()` opens a fresh one.
 */
pool.on("error", (error) => {
  console.error("[db] idle client error", error);
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
    client.release();
    return result;
  } catch (error) {
    // The ROLLBACK is best-effort and its own failure is swallowed ON PURPOSE.
    // The case where it fails is the case where the connection itself died --
    // which is usually the very thing that threw `error` a moment ago. Letting
    // the ROLLBACK's rejection propagate would replace the real cause with a
    // meaningless "connection terminated", losing the only useful diagnostic.
    //
    // `release(true)` then DESTROYS the connection rather than returning it to
    // the pool: a client whose ROLLBACK did not land may still be inside an
    // aborted transaction, and handing that to the next caller would fail
    // their query for reasons they cannot see. Discarding it costs one
    // reconnect; reusing it costs a bug that only shows up under load.
    let rolledBack = true;
    try {
      await client.query("ROLLBACK");
    } catch {
      rolledBack = false;
    }

    client.release(rolledBack ? undefined : true);
    throw error;
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
