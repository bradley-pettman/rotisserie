# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

A fresh start toward a mobile app. The database, the domain layer and the HTTP
API are in place, with accounts and households; the Expo app (Phase 4) is in
progress in `apps/mobile`. The plan is in `docs/ROADMAP.md`.

## Ownership — read before writing code

Claude may write code in every layer. The owner will say when they want to
implement a piece themselves; leave that piece alone and explain or review
instead.

**Never commit, push or open a PR in this project.** The owner reviews every
change first and commits it themselves.

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
npm run invite -w @rotisserie/api [householdId]   # Print an invite code (default: the household with no members)

npm start -w @rotisserie/mobile          # Expo dev server; open it in Expo Go on the phone
npx expo install <pkg>                   # From apps/mobile: adds an SDK-compatible version
```

The app reads `EXPO_PUBLIC_API_URL` from `apps/mobile/.env.local` (copy
`apps/mobile/.env.example`). On a phone, use the laptop's LAN IP, not localhost.

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
  src/auth/           scrypt password hashing, session tokens and invite codes (node:crypto only)
  src/providers/      SQL query functions, one file per area (sql.ts: generic SQL helpers; errors.ts: NotFoundError and strict)
  src/use-cases/      One file per use case, built with defineUseCase (actors.ts: UserActor, MemberActor; errors.ts: 401/403/409 errors)
  src/api/            Hono app, error envelope, auth.ts (requireUser, requireMember), routes/ (one file per resource)
  src/scripts/        One-off scripts (invite-to-household.ts)
  src/server.ts       Starts the API
  src/test/           Vitest global setup, per-test reset, factories, accounts (default member), API request helper
apps/mobile/          @rotisserie/mobile: Expo SDK 57, Expo Router
  src/app/            Routes: sign-in, sign-up, welcome (start or join a household); (tabs) for Meals and
                      Recipes; create, plan, log, recipe-editor, household are modals. _layout.tsx guards
                      each group with Stack.Protected on the auth state
  src/api/            fetch client (Bearer token, parses responses with the shared schemas), auth.tsx
                      (AuthProvider, useAuth, token in expo-secure-store) and TanStack Query hooks
  src/components/     UI building blocks; colors come from useColors()
  src/lib/            Pure helpers (dates, meals, quantities, recipes); quantities has Vitest tests
  src/theme/          Golden hour tokens: light and dark palettes, Figtree type scale
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
hold application decisions such as not-found, ownership, permissions or
changelog writes. Providers do one data operation each. Routes never import
providers.

Who is asking travels separately from what is asked. A use case that needs a
caller declares `actor: UserActor` (signed in) or `actor: MemberActor` (signed
in and in a household) and receives it as the second argument:
`implementation: async (input, { householdId }) => ...`. Each route lists
`requireUser` or `requireMember` before its validators and passes `c.var.user`
or `c.var.member`; leaving the middleware out is a type error. Put the
middleware on each route, never `app.use()` in a route module: modules mounted
at `/` would turn it into `/*` for the whole app. Owner-only actions call
`assertOwner(member)` in the use case.

Auth is email and password. `POST /auth/sign-up` and `/auth/sign-in` return an
opaque token the app sends as `Authorization: Bearer`. Only its SHA-256 is
stored (`sessions.token_hash`); sessions last 90 days and slide forward at most
once a day. Errors: 401 `unauthenticated`, 403 `no_household` (signed in, no
household yet) and 403 `forbidden` (not an owner).

## Data model

Four areas, fifteen tables:

- **Accounts:** `users`, `sessions`, `households`, `household_members` and
  `household_invites`. A user belongs to at most one household
  (`household_members.user_id` is unique) as `owner` or `member`, and a
  household always keeps an owner. Invites are single-use 8-character codes
  that last 7 days; joining a household with no members makes you its owner.
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

Every recipe, tag, planned meal and cooked meal belongs to one household
(`household_id`, `ON DELETE CASCADE`). A row that points at two
household-owned rows (`recipe_tags`, `planned_meal_dishes`,
`cooked_meal_dishes`) carries `household_id` too, and both of its foreign keys
include it, so Postgres refuses a reference across households; the same holds
for `cooked_meals.planned_meal_id`. `ingredients` and `units` stay one shared
dictionary: listings show rows with `is_standard` (set by the seeds) plus the
ones the household's own recipes use, so no household sees another's names.

Intent and fact are separate tables on purpose: when plan and reality differ,
both must survive, and they need opposite delete rules:

- `planned_meal_dishes.recipe_id` is `ON DELETE CASCADE`. A plan for a deleted
  recipe is meaningless.
- `cooked_meal_dishes.recipe_id` is `ON DELETE SET NULL (recipe_id)`, alongside a
  required `label` snapshot, so history survives recipe deletes and renames.
  Plans resolve recipe names live; history reads `label` and never joins for a
  name.

## Database conventions

- Every query on household data filters by `household_id`, which providers
  take as their first argument. Upserts by client id add
  `WHERE <table>.household_id = EXCLUDED.household_id` to `DO UPDATE` and
  return null when nothing comes back (the id belongs to another household),
  which the use case turns into a 404 through the `...Strict` provider.
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
