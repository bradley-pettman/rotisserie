#!/usr/bin/env node
/**
 * Applies the SQL files in db/seeds/ to $DATABASE_URL.
 *
 * Run migrations first (`dbmate up`) — the seeds only insert rows, they do not
 * create tables. Every seed file uses `ON CONFLICT DO NOTHING`, so this script
 * is safe to run repeatedly.
 *
 * Usage: npm run db:seed
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const seedsDir = join(dirname(fileURLToPath(import.meta.url)), "seeds");

// Applied in this order; both tables are independent, but keep it deterministic.
const SEED_FILES = ["units.sql", "ingredients.sql"];

// Pick up DATABASE_URL from a local .env if it is not already exported.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
  } catch {
    // No .env file — fall through to the error below.
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env, or export it:\n" +
      "  export DATABASE_URL=postgres://postgres:postgres@localhost:5432/rotisserie_dev?sslmode=disable"
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
} catch (error) {
  console.error(
    `Could not connect to the database. Is Postgres running? (docker-compose up -d)\n  ${error.message}`
  );
  process.exit(1);
}

try {
  await client.query("BEGIN");

  for (const file of SEED_FILES) {
    const sql = readFileSync(join(seedsDir, file), "utf8");
    await client.query(sql);
    console.log(`seeded db/seeds/${file}`);
  }

  await client.query("COMMIT");
  console.log("Seeding complete.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    `Seeding failed (rolled back). Have you run migrations? (dbmate up)\n  ${error.message}`
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
