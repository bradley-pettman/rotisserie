# Rotisserie technical roadmap

From an empty-but-sound database to a meal-planning app on your phone.

The target system:

```
┌──────────────────────┐    HTTPS · JSON    ┌──────────────────────┐    SQL    ┌────────────┐
│  Expo app (iOS/And.) │ ─────────────────▶ │  Node API (Hono)     │ ────────▶ │ PostgreSQL │
│  screens + API client│                    │  routes → Zod → SQL  │           │  (dbmate)  │
└──────────────────────┘                    └──────────────────────┘           └────────────┘
            ▲                                          ▲
            └────────── packages/shared: Zod schemas + TS types ──────────┘
```

## Who builds what

| Layer | Owner |
|---|---|
| Schema and migrations (`db/migrations`) | Done in Phase 0. Changes are discussed first. |
| Zod schemas, TS types, SQL query functions, their tests | **Built by hand.** Claude explains and reviews, and doesn't write it. |
| HTTP API, mobile app, deployment, builds | Claude can own it, with review. |

The line sits at the query functions on purpose. Below it is where the domain
rules live: canonical names, snapshots, transactions. Above it is mostly wiring.

---

## Phase 0: Foundation ✅

- [x] Schema: 10 tables across the recipe book, planned meals and cooked meals (`db/migrations`)
- [x] Seeds: units and ingredients (`npm run db:seed`)
- [x] Connection pool, query helpers and `withTransaction` (`src/db/connection.ts`)
- [x] CI: typecheck, unit tests, and migrations applied, seeded, rolled back and re-applied

**Local setup after this commit.** The old tables are still in your dev
database, and dbmate will try to create the new ones on top of them. Reset it
once:

```bash
dbmate drop && dbmate create && dbmate up && npm run db:seed
```

## Phase 1: Domain layer (by hand)

The goal is to be able to drive the whole Friday scenario (plan sloppy joes,
eat meatloaf) from TypeScript, with no HTTP involved.

1. **Zod schemas and types**, one file per area under `src/`:
   - Recipe input: name, instructions, times, servings, ingredient lines
     (name, quantity, unit, notes) and tag names
   - Recipe output: the row plus resolved ingredient lines and tags
   - Planned meal plus dishes, and cooked meal plus dishes
   - Shared building blocks: `MealSlot`, a `YYYY-MM-DD` calendar-date string, UUIDs
   - Derive types with `z.infer`, and keep input and output schemas separate
2. **Query functions**, raw SQL through `DB.query` / `queryOne` / `withTransaction`:
   - `createRecipe` / `updateRecipe`, in one transaction each: upsert the
     ingredient, unit and tag names (lowercase and trim first), then write the
     lines. Replace the ingredient lines wholesale on update.
   - `getRecipe(id)` with lines and tags; `searchRecipes(q, limit, cursor)`
   - `planMeal`, `moveMeal`, `addDish`, `removeDish`; `getWeek(from, to)`,
     which resolves recipe names in one batched query, not one per dish
   - `logCookedMeal`: copy each recipe's current name into `label` inside the
     same transaction; optionally link `planned_meal_id`
   - `lastMade(recipeIds[])`: `MAX(cooked_on)` excluding leftovers, batched
     with `= ANY($1::uuid[])`
3. **Tests.** Unit tests for pure helpers (canonicalizing names, scaling).
   Integration tests for query functions against a real Postgres: a separate
   `rotisserie_test` database, migrated once, each test in a transaction that
   rolls back.

**Things to get right here:**

- DATE columns: select them with `to_char(col, 'YYYY-MM-DD')` and keep them as strings.
- `COUNT(*)` comes back as a string. Cast with `::int`.
- Unit synonyms ("tbsp", "T", "tablespoons") need folding onto one canonical name
  before the upsert. The old app's `canonicalizeUnit` and `parse-ingredient.ts`
  are in git history (see below).

**Done when:** a script (`npx tsx src/scripts/friday.ts`) plans the meal, logs what
was actually eaten, and prints plan versus reality.

## Phase 2: HTTP API

- Hono on Node (`@hono/node-server`), run with `tsx watch` in dev
- Routes validate with the Phase 1 schemas and call the Phase 1 query functions,
  with no SQL in route files
- One error envelope: `{ error: { code, message, fields? } }`; 400 for
  validation, 404 and 409 mapped from Postgres error codes (23505 unique,
  23503 FK, 23514 check)
- `GET /health` using `checkDatabase()`
- Endpoints:
  - `GET/POST /recipes`, `GET/PUT/DELETE /recipes/:id`
  - `GET /units`, `GET /ingredients?q=` (autocomplete)
  - `GET /meals?from=&to=` (planned and cooked meals for a range, side by side)
  - `POST /planned-meals`, `PATCH/DELETE /planned-meals/:id`, plus dish sub-routes
  - `POST /cooked-meals`, `GET /cooked-meals?before=` (history, paged)
- Tests: Hono's `app.request()` against the test database, with no server process

**Done when:** the Friday scenario runs end to end with `curl` (or a `.http` file).

## Phase 3: Monorepo

Do this before the first line of mobile code so the shared types exist from day one.

```
apps/api/          ← src/ moves here
apps/mobile/       ← new Expo app
packages/shared/   ← Zod schemas + types from Phase 1
db/                ← stays at the root
```

npm workspaces. Expo's Metro bundler supports workspaces without extra configuration on current SDKs.
Check that the `~/` path alias still resolves in both apps.

## Phase 4: Mobile app v1, read and log

- Expo with **Expo Router** (file-based navigation) and **TanStack Query** for
  server state (caching, refetch, loading and error states)
- `EXPO_PUBLIC_API_URL` set to your laptop's LAN IP during development; run on
  your phone through Expo Go
- Screens:
  1. **Tonight:** today's planned meals, each with a "Made it" button
  2. **Recipes:** searchable list
  3. **Recipe:** ingredients scaled to a headcount, "last made" date
  4. **Cook mode:** one step at a time, large text, screen kept awake (`expo-keep-awake`)
  5. **Log a meal:** record what you ate, planned or not ("Made it" pre-fills it from the plan)

**Done when:** you use it to cook dinner on a real night.

## Phase 5: Planning on the phone

- Week view: planned meals and what you actually ate, side by side
- Plan a meal: pick a slot, add dishes (recipe search or free text), set headcount
- Move a meal (one `PATCH`), remove a dish
- Plan versus reality: replaced meals, skipped meals, unplanned meals

## Phase 6: Deploy and auth

Needed once the app has to work away from home Wi-Fi.

- Host the API and a managed Postgres (Fly.io, Railway or Render, plus Neon or
  the host's own Postgres). Run migrations as a release step.
- Auth, in increasing order of effort:
  1. One long random API token, stored on the phone with `expo-secure-store`
  2. Real accounts, once more than one person needs their own login
- HTTPS only; database backups switched on and a restore tested once

## Phase 7: On your phone for real

- EAS Build (cloud builds, so no local Xcode project needed)
- iOS: Apple Developer account and TestFlight. Android: internal testing track.
- App icon from `docs/logo.png`
- EAS Update for over-the-air JavaScript updates without a rebuild

## Later

- **Offline:** persist the TanStack Query cache, then consider local SQLite if
  the kitchen has bad signal
- **Recipe import from a URL:** the old scraper and parsers are in git history
- **Grocery list** generated from a week of planned meals
- **Tags UI**, a web client (just another API client)

## Open decisions

Settle the first one before Phase 6, because it changes every table.

1. **One user or a household?** Sharing means a `households` table and a
   `household_id` on recipes, planned meals and cooked meals, and every query
   scoped by it. Adding it later is a migration on every table plus a backfill.
2. **"Cooked" or "eaten"?** If takeout belongs in history, `cooked_meals` is
   slightly misnamed. Renaming before there's data is cheap; renaming later isn't.
3. **One meal per slot?** `planned_meals_one_per_slot` says yes. Drop it if you
   want separate kids' and adults' dinners.

## The old app

The React Router web app, the JSON API and the Python agent were removed in the
commit that added this file. Its parent commit, `0afa466`, has all of them:

```bash
git show 0afa466:app/features/recipes/lib/parse-ingredient.ts
git checkout 0afa466 -- app/features/recipes/lib   # restore a folder to read
```
