import pg from "pg";

const { Pool } = pg;

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

export const DB: DB = { query, queryOne, withTransaction };

export { pool };
