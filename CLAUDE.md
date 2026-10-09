# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

A fresh start toward a mobile app. The database, the domain layer and the HTTP
API are in place; the Expo app is next. The plan is in `docs/ROADMAP.md`.

## Ownership — read before writing code

The owner is writing the **Zod schemas, TypeScript types, SQL query functions
and their tests** by hand, to learn them. In that layer, do not write or
generate code unless explicitly asked for that specific piece. Explain,
review, answer questions and point at the relevant migration instead.

From the HTTP API upward (routes, the Expo app, deployment, builds), Claude may
write code. See "Who builds what" in `docs/ROADMAP.md`.

**Never write code comments** (TS, SQL, YAML, config). The owner writes them or
asks for a specific one. Explain in the conversation instead. Tool-required
markers such as dbmate's `-- migrate:up` / `-- migrate:down` stay.

## Commands

```bash
docker-compose up -d     # Start PostgreSQL (loopback only)
dbmate up                # Run migrations
dbmate rollback          # Undo the latest migration
npm run db:seed          # Load units + ingredients (idempotent)

npm run dev              # API on http://localhost:3000 (PORT to change), restarts on save
npm run typecheck        # tsc in every workspace
npm test                 # Vitest in every workspace; the API's needs Postgres and recreates rotisserie_test
npm test -w @rotisserie/api      # One workspace (also @rotisserie/shared)
npm install <pkg> -w @rotisserie/api   # Add a dependency to one workspace
npx tsx <file.ts>        # Run a TypeScript file directly
```

## Structure

```
npm workspaces: `apps/*` and `packages/*`. Shared compiler options live in
`tsconfig.base.json`; formatting, `db/` and `.env` stay at the root.

```
db/migrations/        SQL migrations (dbmate)
db/seeds/             Units and ingredient vocabulary
db/seed.mjs           Applies the seeds
apps/api/             @rotisserie/api
  src/db/connection.ts  pg pool, DB.query / queryOne / withTransaction, checkDatabase
  src/providers/      SQL query functions, one file per area (sql.ts: generic SQL helpers; errors.ts: NotFoundError and strict)
  src/use-cases/      One file per use case, built with defineUseCase
  src/api/            Hono app, error envelope, routes/ (one file per resource)
  src/server.ts       Starts the API
  src/test/           Vitest global setup, per-test reset, factories, API request helper
packages/shared/      @rotisserie/shared: Zod schemas, types and pure domain helpers, one folder per area
docs/ROADMAP.md       Phases from here to an app on a phone
docs/SPEC.md          Product spec (features, not implementation)
```

Imports: `~/` maps to `apps/api/src/` inside the API. `@rotisserie/shared/<area>`
resolves through the workspace package's `exports` to `packages/shared/src/<area>/index.ts`
(TypeScript source, no build step). `packages/shared` must stay free of Node and
server dependencies so the Expo app can import it.

## Layers

`route → use case → provider`. Routes handle HTTP only: validate the request
against the use case's `.input` schema, call one use case, and choose the
status. Use cases (`defineUseCase`, a `z.function` validating input and output)
hold application decisions such as not-found, ownership and future
permissions or changelog writes. Providers do one data operation each. Routes
never import providers.

## Data model

Three areas, ten tables:

- **Recipe book:** `recipes`, `recipe_ingredients`, `recipe_tags`, plus the
  shared vocabularies `ingredients`, `units` and `tags`.
- **Plan (intention):** `planned_meals` and `planned_meal_dishes`. These are
  mutable. There is no plan table; a week is a date range over
  `planned_meals`. A planned meal with no `planned_on` is unscheduled: it
  sits in the "Planned" pool (shopped for, not yet given a day) until it gets
  a date or a cooked meal links to it.
- **History (fact):** `cooked_meals` and `cooked_meal_dishes`. What was
  actually eaten. `cooked_meals.planned_meal_id` (nullable, unique) links it
  to the plan it fulfilled or replaced. `POST /cooked-meals/settle` (called by
  the app on open, with the phone's today) logs every past-dated, uncooked
  plan as a cooked meal with `settled_on` set to that day; any edit through
  the upsert confirms it (`settled_on` back to NULL). To undo a settled meal,
  move or delete its plan, or settle recreates it.

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
