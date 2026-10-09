# Rotisserie technical roadmap

From an empty-but-sound database to a meal-planning app on your phone.

The target system:

```
┌──────────────────────┐    HTTPS · JSON    ┌─────────────────────────────────┐    SQL    ┌────────────┐
│  Expo app (iOS/And.) │ ─────────────────▶ │  Node API (Hono)                │ ────────▶ │ PostgreSQL │
│  screens + API client│                    │  routes → use cases → providers │           │  (dbmate)  │
└──────────────────────┘                    └─────────────────────────────────┘           └────────────┘
            ▲                                          ▲
            └────────── packages/shared: Zod schemas + TS types ──────────┘
```

## Who builds what

| Layer | Owner |
|---|---|
| Schema and migrations (`db/migrations`) | Done in Phase 0. Changes are discussed first. |
| Zod schemas, TS types, SQL query functions, their tests | **Built by hand.** Claude explains and reviews, and doesn't write it. |
| Use cases (`apps/api/src/use-cases`), HTTP API, mobile app, deployment, builds | Claude can own it, with review. |

The line sits at the query functions on purpose. Below it is where the domain
rules live: canonical names, snapshots, transactions. Above it is mostly wiring.

---

## Phase 0: Foundation ✅

- [x] Schema: 10 tables across the recipe book, planned meals and cooked meals (`db/migrations`)
- [x] Seeds: units and ingredients (`npm run db:seed`)
- [x] Connection pool, query helpers and `withTransaction` (`apps/api/src/db/connection.ts`)
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

1. **Zod schemas and types**, one folder per area under `packages/shared/src/`:
   - Recipe input: name, instructions, times, servings, ingredient lines
     (name, quantity, unit, notes) and tag names
   - Recipe output: the row plus resolved ingredient lines and tags
   - Planned meal plus dishes, and cooked meal plus dishes
   - Shared building blocks: `MealSlot`, a `YYYY-MM-DD` calendar-date string, UUIDs
   - Each area exports one `XSchemas` object (row, app shape, write inputs) and a
     same-named type from `InferSchemas`, used as `RecipeSchemas['Recipe']`
2. **Query functions**, raw SQL through `DB.query` / `queryOne` / `withTransaction`:
   - Writes are upserts by a client-generated id (`INSERT ... ON CONFLICT (id)
     DO UPDATE`), so a retried save never duplicates. Child rows (ingredient
     lines, tags, dishes) are replaced wholesale in the same transaction.
   - `upsertRecipe(input)`: upsert the ingredient, unit and tag names
     (lowercase and trim first), then the recipe, then its lines and tags.
   - `getRecipe(id)` with lines and tags; `listRecipes({ q, limit, cursor })`
   - `upsertPlannedMeal(input)`, `addPlannedDish`, `removePlannedDish`;
     `listPlannedMealsWithinDateRange(from, to)`, which resolves recipe names in one batched
     query, not one per dish
   - `upsertCookedMeal(input)`: copy each recipe's current name into
     `label` inside the same transaction; optionally link `planned_meal_id`
   - `lastMade(recipeIds[])`: `MAX(cooked_on)` excluding leftovers, batched
     with `= ANY($1::uuid[])`
3. **Tests.** Unit tests for pure helpers (canonicalizing names, scaling).
   Integration tests for query functions against a real Postgres: a separate
   `rotisserie_test` database, recreated and migrated once per run, with every
   table truncated and re-seeded before each test.

**Things to get right here:**

- DATE columns: select them with `to_char(col, 'YYYY-MM-DD')` and keep them as strings.
- `COUNT(*)` comes back as a string. Cast with `::int`.
- Unit synonyms ("tbsp", "T", "tablespoons") need folding onto one canonical name
  before the upsert. `canonicalizeName` and `canonicalizeUnit` live in
  `packages/shared/src/base/vocabulary.ts`; the old `parse-ingredient.ts` is in
  git history (see below).

**Done when:** a script (`npx tsx apps/api/src/scripts/friday.ts`) plans the meal, logs what
was actually eaten, and prints plan versus reality.

## Phase 2: HTTP API

Requests flow through three layers, each doing one job:

```
route (api/routes)        HTTP: validate params, query and body; pick the status code
  → use case (use-cases)  one application action, e.g. GetRecipeById
    → provider (providers) one data operation: SQL in, rows out

All three under apps/api/src/.
```

- [x] Hono on Node (`@hono/node-server`); `npm run dev` runs `tsx watch` on `apps/api/src/server.ts`
- [x] **Use cases** are built with `defineUseCase({ input, output, implementation })`, a
      `z.function` that validates its input and output. They're the home for
      anything beyond fetching data: not-found decisions, ownership checks, and
      later permissions, tenancy or a changelog writer. Routes never call
      providers directly.
- [x] Routes validate the request with `@hono/zod-validator` against the use
      case's own `.input` schema, with no SQL in route files
- [x] One error envelope: `{ error: { code, message, fields? } }`. 400 for an
      invalid request or cursor, 404 for `NotFoundError`, 409 mapped from Postgres
      (23502 not null, 23503 FK, 23505 unique, 23514 check), 500 for anything
      else, including a use case breaking its own output contract
- [x] `GET /health`: 200, or 503 when the database is unreachable
- [x] Endpoints. Writes are `PUT` with the client-generated id in the path:
  - `GET /recipes?q=&limit=&cursor=`, `GET/PUT/DELETE /recipes/:id`
  - `GET /ingredients?q=` (autocomplete), `GET /units`, `GET /tags`
  - `GET /meals?from=&to=` (planned and cooked meals for a range, side by side)
  - `GET /planned-meals/unscheduled` (the Planned pool), `GET/PUT/DELETE /planned-meals/:id`, `POST /planned-meals/:id/dishes`,
    `DELETE /planned-meals/:id/dishes/:dishId`
  - `GET /cooked-meals?limit=&cursor=` (history, paged), `GET/PUT/DELETE /cooked-meals/:id`,
    `POST /cooked-meals/settle` (log past plans as eaten, with `settled_on` set)
- [x] Tests: Hono's `app.request()` against the test database, with no server process

**Done when:** the Friday scenario runs end to end with `curl` (or a `.http` file).

## Phase 3: Monorepo ✅

```
apps/api/          @rotisserie/api: the former src/
apps/mobile/       new Expo app (created in Phase 4)
packages/shared/   @rotisserie/shared: Zod schemas, types and vocabulary helpers
db/                stays at the root
```

- [x] npm workspaces (`apps/*`, `packages/*`); root scripts run each workspace's
      `typecheck` and `test`
- [x] `@rotisserie/shared` is a real package. Its `exports` map points
      `@rotisserie/shared/<area>` at TypeScript source, so there's no build
      step; tsx, Vitest and TypeScript all read it directly, and so will Metro
- [x] Compiler options shared through `tsconfig.base.json`; each workspace has its
      own `tsconfig.json` and runs its own tests (only the API's need Postgres)
- [x] One copy of `zod` across the workspaces (`npm ls zod`), so schemas and
      error classes are the same objects everywhere

When `apps/mobile` arrives: Expo's Metro bundler supports workspaces without
extra configuration on current SDKs. Keep `packages/shared` free of Node and
server-only dependencies.

## Phase 4: Mobile app v1: plan, cook and log

- Expo with **Expo Router** (file-based navigation) and **TanStack Query** for
  server state (caching, refetch, loading and error states)
- `EXPO_PUBLIC_API_URL` set to your laptop's LAN IP during development; run on
  your phone through Expo Go
- Navigation (the app map lives at https://claude.ai/artifact/MxAeVQVxcGtLTYXfCdsZTE):
  tabs for **Meals** and **Recipes**, plus a **+ Create** button that opens a
  menu of Log a meal, Plan a meal and Create a recipe
- Screens:
  1. **Meals (home):** a week strip over a scroll of days that opens on today,
     plus the **Planned** tray: meals planned without a day. Today with nothing
     scheduled offers the Planned meals to pick from
  2. **Planned meal:** its dishes and headcount, with "Made it" and "Made something else"
  3. **Recipes:** searchable list
  4. **Recipe:** ingredients scaled to a headcount, "last made" date
  5. **Cook mode:** one dish at a time, one step at a time, large text, screen
     kept awake (`expo-keep-awake`). Starts from a recipe or a planned meal's dish
  6. **Log a meal:** record what you ate, planned or not ("Made it" pre-fills it from the plan)
  7. **Plan a meal:** one meal at a time: slot (dinner by default), dishes
     (recipe search or free text), headcount, and an optional day. Without a
     day it goes to Planned. Days in the past can't be planned (they show greyed out)
  8. **Recipe editor:** create or edit a recipe: ingredient lines with
     autocomplete, steps, times, servings, tags

- On open and on returning to the foreground, the app calls
  `POST /cooked-meals/settle` with its local today, so plans whose day has
  passed count as eaten. "Made it" logs on the spot with an Undo · Edit toast.

**Done when:** you use it to cook dinner on a real night.

## Phase 5: Planning on the phone

- Calendar view, toggled from the Meals timeline, for looking ahead ("what are
  we having next Thursday?"): a month grid, with the selected day's meals and
  its Pick from Planned choices below
- Plan a meal from an empty day in the calendar
- Move a meal (one `PUT`), remove a dish
- Cooked meal detail: rating and notes
- Plan versus reality: replaced meals, skipped meals, unplanned meals

## Phase 6: Deploy and auth

Needed once the app has to work away from home Wi-Fi. AWS on purpose, as a
learning exercise: Fly.io with Neon would be cheaper (about $0–5 a month) and
simpler.

```
Expo app ──HTTPS──▶ API Gateway (HTTP API) ──▶ Lambda (Hono) ──VPC──▶ RDS Postgres
                                                     │                    ▲
                                                     └── IAM auth token ──┘
```

| Piece | Choice | ~Monthly |
|---|---|---|
| API | API Gateway **HTTP API** (v2), not REST API | pennies |
| Compute | Lambda, arm64, Node, `handle(app)` from `hono/aws-lambda` | ~$0 |
| Database | RDS Postgres `db.t4g.micro`, single-AZ, 20 GB gp3, private subnet, no public IP | ~$14 (~$8–10 reserved for a year) |
| Credentials | RDS IAM authentication (`@aws-sdk/rds-signer`) | $0 |
| Logs | CloudWatch Logs, 1–2 week retention | pennies |
| Infrastructure | AWS CDK in TypeScript, as `apps/infra` | $0 |

Total about $15 a month, less while the new-account credits last.

- **Infrastructure as code:** one CDK stack in `apps/infra` for the VPC, RDS,
  Lambda and HTTP API. Nothing is created by clicking in the console.
- **Networking:** the Lambda runs in the VPC's private subnets so it can reach
  RDS. No NAT gateway (~$32 a month): the API only talks to Postgres, and
  anything else it needs is resolved at deploy time and passed in as
  environment variables, so no VPC endpoints either.
- **Database access:** the Lambda's role signs a short-lived IAM token as the
  Postgres password. Signing is local, so it needs no network call and there
  is no stored password.
- **Connections:** the `pg` pool is created outside the handler with `max: 1`
  so warm invocations reuse it. No RDS Proxy (~$22 a month) at this scale.
- **Migrations:** a small migration Lambda in the same VPC runs dbmate's
  migrations and is invoked as a deploy step, since the database isn't
  reachable from a laptop or CI.
- **Deploys:** GitHub Actions authenticates to AWS with OIDC (no long-lived
  keys), runs `cdk deploy`, then invokes the migration Lambda.
- **Backups:** RDS automated backups with 7-day retention; a point-in-time
  restore to a new instance tested once.
- **Auth**, in increasing order of effort:
  1. One long random API token, stored on the phone with `expo-secure-store`
  2. Real accounts, once more than one person needs their own login
- HTTPS only (API Gateway provides it); a custom domain is optional

Things to avoid: a NAT gateway, RDS Proxy, Secrets Manager (SSM Parameter Store
or IAM auth instead), a public IP on the database, Aurora DSQL (no foreign
keys, and the schema depends on them), and Aurora Serverless v2 scaled to zero
(its ~15s resume would hit almost every time the app is opened).

**Done when:** the phone talks to the deployed API over cellular data, and a
restore has been tested.

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
