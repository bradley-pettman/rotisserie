# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

A fresh start toward a mobile app. The database is in place. The domain layer
is being written by hand, and the API and Expo app come after it. The plan is
in `docs/ROADMAP.md`.

## Ownership — read before writing code

The owner is writing the **Zod schemas, TypeScript types, SQL query functions
and their tests** by hand, to learn them. In that layer, do not write or
generate code unless explicitly asked for that specific piece. Explain,
review, answer questions and point at the relevant migration instead.

From the HTTP API upward (routes, the Expo app, deployment, builds), Claude may
write code. See "Who builds what" in `docs/ROADMAP.md`.

## Commands

```bash
docker-compose up -d     # Start PostgreSQL (loopback only)
dbmate up                # Run migrations
dbmate rollback          # Undo the latest migration
npm run db:seed          # Load units + ingredients (idempotent)

npm run typecheck        # tsc
npm test                 # Vitest (src/**/*.test.ts)
npx tsx <file.ts>        # Run a TypeScript file directly
```

## Structure

```
db/migrations/      SQL migrations (dbmate). The comments in them explain each table.
db/seeds/           Units and ingredient vocabulary
db/seed.mjs         Applies the seeds
src/db/connection.ts  pg pool, DB.query / queryOne / withTransaction, checkDatabase
docs/ROADMAP.md     Phases from here to an app on a phone
docs/SPEC.md        Product spec (features, not implementation)
```

Path alias: `~/` maps to `src/`.

## Data model

Three areas, ten tables:

- **Recipe book:** `recipes`, `recipe_ingredients`, `recipe_tags`, plus the
  shared vocabularies `ingredients`, `units` and `tags`.
- **Plan (intention):** `planned_meals` and `planned_meal_dishes`. These are
  mutable. There is no plan table; a week is a date range over
  `planned_meals`.
- **History (fact):** `cooked_meals` and `cooked_meal_dishes`. What was
  actually eaten. `cooked_meals.planned_meal_id` (nullable, unique) links it
  to the plan it fulfilled or replaced.

Intent and fact are separate tables on purpose: when plan and reality differ,
both must survive, and they need opposite delete rules:

- `planned_meal_dishes.recipe_id` is `ON DELETE CASCADE`. A plan for a deleted
  recipe is meaningless.
- `cooked_meal_dishes.recipe_id` is `ON DELETE SET NULL`, alongside a
  required `label` snapshot, so history survives recipe deletes and renames.
  Plans resolve recipe names live; history reads `label` and never joins for a
  name.

## Database conventions

- `ingredients`, `units` and `tags` names are **lowercase and trimmed**,
  enforced by CHECK constraints. Canonicalize before the upsert and capitalize
  only when displaying.
- `meal_slot` is a domain (`breakfast`/`lunch`/`dinner`/`snack`) shared by
  both meal tables.
- DATE columns are calendar days: select them with
  `to_char(col, 'YYYY-MM-DD')` and keep them as strings, or `pg` returns a
  Date at local midnight and the day shifts.
- NUMERIC comes back as a number (a global parser in `connection.ts`).
  COUNT/SUM of integers come back as strings, so cast them with `::int`.
- Batch lookups by id list with `= ANY($1::uuid[])`, not a query per row.
- Multi-table writes go through `DB.withTransaction`.
- UUID primary keys throughout.
- Read the relevant migration before changing a constraint.
