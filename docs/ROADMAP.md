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

Claude can write any layer, with review. The owner says which pieces they
want to implement by hand, and commits every change themselves after
reviewing it. Schema changes are discussed before they're written.

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
   - `listRecipeStats(recipeIds[])`: average rating, rating count, times made
     and last made per recipe, excluding leftovers, batched with `= ANY($1::uuid[])`
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
  - `GET /recipes?q=&tag=&sort=&limit=&cursor=` (`q` matches names and ingredients; `sort` is `recentlyMade`, `longestAgo`, `name` or `rating`), `GET/PUT/DELETE /recipes/:id`
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

## Phase 4: Mobile app v1: plan and log

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
     scheduled offers the Planned meals to pick from. Meals have no name: a
     one-line row shows the first dish (by `sort_order`) as the headline and
     the rest after it, truncated ("**Chili** · cornbread, bag salad mix")
  2. **Planned meal:** its dishes and headcount, with "Made it" and "Made something else"
  3. **Recipes:** searchable list
  4. **Recipe:** ingredients scaled to a headcount, the instructions, the
     website it came from, and stats (average rating with its count, times
     made, last made). A **+ Tag** chip adds tags in a bottom sheet without
     opening the editor. **Add to Planned** is the main action
  5. **Log a meal:** record what you ate, planned or not ("Made it" pre-fills it from the plan)
  6. **Plan a meal:** one meal at a time: slot (dinner by default), dishes
     (recipe search or free text), headcount, and an optional day. Without a
     day it goes to Planned. Days in the past can't be planned (they show greyed out)
  7. **Recipe editor:** create or edit a recipe. Ingredients are typed one
     line at a time ("2 tbsp chili powder") with autocomplete; each line turns
     into chips (quantity and unit, ingredient, notes) and pasting a list
     splits it into lines. Also instructions, times, servings, tags (with
     suggestions), website and notes

- On open and on returning to the foreground, the app calls
  `POST /cooked-meals/settle` with its local today, so plans whose day has
  passed count as eaten. "Made it" logs on the spot with an Undo · Edit toast.

**Done when:** you use it to cook dinner on a real night.

## Accounts and households ✅

Done ahead of deploy, because a `household_id` touches every table and is
cheapest before there is real data.

- [x] Email and password accounts: scrypt hashes, opaque session tokens stored
      as SHA-256, 90-day sessions that slide forward on use
- [x] Households: one per person, `owner` and `member` roles, single-use invite
      codes that last 7 days. Recipes, tags, plans and history belong to a
      household; composite foreign keys stop references across households
- [x] Ingredients and units stay one shared dictionary; each household only
      sees the standard entries and the ones its recipes use
- [x] App: sign in, sign up, start or join a household, and a Household screen
      (members, invites, roles, leave, sign out)
- [x] Existing data moves into a household called "Home" during the migration;
      `npm run invite -w @rotisserie/api` prints a code to join it, and whoever
      joins first becomes its owner

Left for later: password change and reset (reset needs email), rate limits on
sign-in and joining, and deleting an account.

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
simpler. Decided in detail in October 2026; the headings below are the plan.

```
Expo app ──HTTPS──▶ API Gateway (HTTP API) ──▶ API Lambda (Hono) ──VPC──▶ RDS Postgres
            api.<domain>                              │                      ▲
                                                      └── IAM auth token ────┤
GitHub Actions ──OIDC──▶ cdk deploy ──▶ Migrator Lambda (dbmate + seeds) ──────┘
```

| Piece | Choice | ~Monthly |
|---|---|---|
| Account | A new account for this app only, `us-east-2`, root MFA, IAM Identity Center sign-in, a Budget alarm at $25 | $0 |
| Domain | Registered in Route 53; `api.<domain>` on the HTTP API with an ACM certificate | $0.50, plus ~$15 a year |
| API | API Gateway **HTTP API** (v2), not REST API | pennies |
| Compute | Lambda, arm64, Node 22, `handle(app)` from `hono/aws-lambda` | ~$0 |
| Database | RDS Postgres 16 `db.t4g.micro`, single-AZ, 20 GB gp3 autoscaling to 50, isolated subnet, no public IP | ~$14 (~$8–10 reserved for a year) |
| Credentials | RDS IAM authentication (`@aws-sdk/rds-signer`); the master password sits in Secrets Manager and is read once | $0.40 |
| Logs and alarms | CloudWatch Logs with 2-week retention; six alarms to one SNS email | ~$1 |
| Infrastructure | AWS CDK in TypeScript, as `apps/infra` | $0 |

Total about $16 a month, less while the new-account credits last.

### Infrastructure as code

Two stacks in `apps/infra`, both built from recipes (below). Nothing is
created by clicking in the console, except registering the domain, which
CloudFormation can't do.

- **`Rotisserie-bootstrap`:** the GitHub OIDC provider and deploy role, and
  the budget. Deployed once from the laptop, because it creates the role CI
  needs before CI can deploy anything.
- **`Rotisserie-prod`:** everything else. Deployed only by CI. It takes a
  stage name for resource names, so a staging stack is one more line, not a
  refactor. Its name and the database construct's id are permanent: renaming
  either replaces the instance.

The region and account are pinned in the stack (`us-east-2`, account id from
`CDK_DEFAULT_ACCOUNT`), so a laptop with a different default can't deploy
somewhere surprising. `cdk.context.json` is committed so the hosted-zone
lookup never needs credentials on a PR.

### The recipes library

`apps/infra/src/recipes/` is a hand-rolled, copy-and-own construct library in
the style of `@maestro-js/aws-cdk-recipes` and SST: each recipe is one
opinionated construct that builds several resources behind a short props
interface. It is plain source with no package and no CLI, and its props
never mention Rotisserie, so it could become a package if a second project
wants it.

| Recipe | Wraps |
|---|---|
| `Vpc` | Two AZs (RDS needs two even for single-AZ), isolated subnets only, no NAT. `publicSubnets: true` is for the day a bastion arrives |
| `PostgresDatabase` | RDS instance with IAM auth, gp3, encryption, backups, deletion protection; `grantConnect(grantee, dbUser)` adds `rds-db:connect` and the security-group rule together |
| `LambdaFunction` | esbuild-bundled `NodejsFunction`, ESM, arm64, its own log group with retention, optional VPC placement |
| `HttpApi` | HTTP API with a Lambda integration, custom domain, certificate, Route 53 alias and per-route throttling |
| `DbmateMigrations` | A `LambdaFunction` carrying dbmate, `db/migrations` and `db/seeds`, wrapped in a CDK Trigger |
| `GitHubOidcRole` | The OIDC provider and a deploy role trusted by one repo and branch |
| `Budget` | A monthly AWS Budgets limit with email alerts |

Conventions every recipe follows:

1. One file, one class, props declared beside it in a `declare namespace`.
   Shared helpers go in `recipes/helpers/` only once two recipes need them.
2. Plain CDK types in (`ec2.IVpc`, `route53.IHostedZone`) and out: every
   underlying resource is a public field (`.instance`, `.function`, `.api`),
   and the stack wires recipes together in ordinary CDK. Recipes don't import
   each other, except `DbmateMigrations` building on `LambdaFunction`.
3. A `transform` hook per child resource, `(props) => props`, for anything
   not exposed as a prop. It runs before construction, which is the only time
   most settings can change.
4. Defaults are the safe, cheap choice: encrypted, private, arm64, 2-week log
   retention, stateful resources on `RemovalPolicy.SNAPSHOT` or `RETAIN` with
   deletion protection. A prop opts out, never in, and there's no
   `dev`/`prod` mode.
5. CDK value types (`Duration`, `Size`), not strings to parse.
6. No hard-coded physical names, so two stacks can't collide. The custom
   domain is the one exception.
7. No `permissions` prop: the stack uses grant methods, which keep the IAM
   policy and the security-group rule together.
8. No code comments, as everywhere in this repo.

Tests are CDK `assertions` in Vitest, run by the root `npm test`: one file
per recipe asserting the defaults in convention 4, plus one test that
`Rotisserie-prod` synthesizes. Bundling is skipped under test
(`aws:cdk:bundling-stacks: []`).

### Networking and database access

- The Lambdas run in the VPC's isolated subnets, which have no route to the
  internet in either direction. No NAT gateway (~$32 a month), no VPC
  endpoints: anything a Lambda needs is resolved at deploy time and passed in
  as environment variables.
- Security groups refer to each other, not to addresses: RDS accepts 5432
  from the API and Migrator groups and nothing else.
- Both Lambdas sign in as one Postgres role, `app`, with a short-lived IAM
  token as the password. Signing is local, so it needs no network call.
  `connection.ts` gets one extra branch: when `DATABASE_URL` is unset it
  reads the `PG*` variables, sets `password` to a signer function (`pg`
  calls it on every new connection, which is what makes a 15-minute token
  work in a Lambda that lives for hours) and verifies TLS against the RDS CA
  bundle committed at `apps/api/certs/`. Local dev, CI and the tests don't
  change.
- Who creates `app`: a `DbBootstrap` trigger that runs once on creation. It
  is the only thing that ever reads the master password, which RDS generates
  into Secrets Manager because that is the one secret store CloudFormation
  can inject into a Lambda's environment inside a VPC with no network. This
  is the one exception to "avoid Secrets Manager" below; the runtime path
  stays IAM.
- The `pg` pool is created outside the handler with `PGPOOL_MAX=1` so warm
  invocations reuse it. No RDS Proxy (~$22 a month) at this scale.

### Migrations

`DbmateMigrations` runs as a CDK Trigger *during* `cdk deploy`, ordered
before the API Lambda's update, so new code never sees the old schema (old
code briefly sees the new one, so migrations add and a later deploy
removes). A failed migration fails the deploy. The bundle holds a pinned
dbmate linux-arm64 binary downloaded and checksummed at synth, plus
`db/migrations` and `db/seeds`; adding a migration file changes the bundle,
which is what reruns the trigger. The handler builds `DATABASE_URL` with a
fresh token, runs `dbmate up`, then applies the seeds.

There is no way into the database from a laptop or CI, on purpose:

- Your recipe book goes in through the API: `load-recipes` moves from
  providers to `PUT /recipes/:id`, signed in as you. Writes are upserts, so
  it is safe to rerun.
- `invite` is not needed in prod: the first sign-up starts a household.
- The restore drill goes through the app (below).
- A bastion (a `t4g.nano` in a public subnet, reached through SSM Session
  Manager with no inbound ports, stopped by default at ~$0.65 a month) is
  one recipe and a few stack lines away, and waits until the first time prod
  needs `psql` by hand.

### Deploys

- A `deploy` job in `ci.yml` with `needs` on the existing jobs, on pushes to
  `main` only, under `concurrency: deploy-prod`. PRs run `cdk synth` as the
  infra's typecheck.
- GitHub authenticates with OIDC (no long-lived keys). The role is trusted
  by `repo:<owner>/rotisserie:ref:refs/heads/main` alone and may only assume
  the `cdk-*` roles that `cdk bootstrap` creates.
- By hand, once: `cdk bootstrap`, `Rotisserie-bootstrap`, and the first
  `Rotisserie-prod` deploy (certificate validation and RDS creation take
  10–20 minutes). After that, prod deploys only through CI.

### Front door

- One `$default` route to the Lambda, so Hono owns routing, plus explicit
  routes for `POST /auth/sign-in`, `POST /auth/sign-up` and
  `POST /household/join` so they can carry their own throttle: 2 requests a
  second, burst 5. The stage default is 50 a second, burst 100, which bounds
  the bill if the URL leaks.
- API Gateway throttles are global per route, not per client. That stops a
  runaway script; per-account lockout stays in "Left for later" above.
- JSON access logs (request id, route, status, latency, integration latency
  for spotting cold starts), 2-week retention. No CORS: a native app sends
  no `Origin`. `GET /health` stays public.
- HTTPS only; API Gateway provides it.

### Operations

- **Alarms,** six lines in the stack, one SNS email: API Lambda errors, HTTP
  API 5xx, Lambda throttles, RDS free storage under 2 GB, RDS CPU over 80%
  for 15 minutes, and the budget. A failed migration shows up as a red
  deploy. No X-Ray, dashboards or Lambda Insights.
- **Backups:** RDS automated backups with 7-day retention, maintenance and
  backup windows in the small hours. The restore drill: restore the latest
  snapshot to a new instance, point the API at it with one env var through
  `cdk deploy`, open the app, delete the restored instance. Written down as
  a runbook in `apps/infra/README.md` after the first run.
- **Cold starts:** with light use most app opens hit a cold Lambda, and the
  first screen fires two or three requests at once. Expect roughly 0.5–1s
  after a quiet stretch, then fast. Measure before doing anything about it.

### Build order

Each step deploys on its own.

1. Account setup, by hand: account, MFA, Identity Center, domain,
   `cdk bootstrap` in `us-east-2`.
2. `apps/infra` skeleton, `GitHubOidcRole`, `Budget`, the CI jobs. An empty
   `Rotisserie-prod` through CI proves the pipeline before anything
   expensive exists.
3. `Vpc`, `PostgresDatabase`, `DbBootstrap`. The role `app` exists.
4. `LambdaFunction`, `DbmateMigrations`. The schema exists in prod.
5. API changes (`lambda.ts`, the IAM branch, the CA bundle, `load-recipes`
   through the API), then `HttpApi` with the domain.
6. Alarms, recipe tests, the restore drill, the runbook.

Auth is already in the API (accounts and households, above). Password reset
needs email, and the VPC Lambda has no outbound network, so it waits for a
NAT (or fck-nat on a `t4g.nano`, about $3 a month) or another way to send
mail.

Things to avoid: a NAT gateway, RDS Proxy, Secrets Manager for anything but
the master password, a public IP on the database, Aurora DSQL (no foreign
keys, and the schema depends on them), and Aurora Serverless v2 scaled to
zero (its ~15s resume would hit almost every time the app is opened).

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
- **Cook mode:** one dish and one step at a time, large text, screen kept awake
  (`expo-keep-awake`), started from a recipe or a planned meal's dish. Needs
  `instructions` split into steps first

## Decisions

1. ~~**One user or a household?**~~ Decided: households. See Accounts and
   households above.
2. ~~**"Cooked" or "eaten"?**~~ Decided: keep `cooked_meals`, even though
   takeout belongs in history too.
3. ~~**One meal per slot?**~~ Decided: keep `planned_meals_one_per_slot`. A
   meal already holds any number of dishes; the constraint only stops two
   separate planned meals in the same day and slot (say, kids' and adults'
   dinners with their own headcounts). Dropping it later needs no data
   migration, and the work would be in the app: the day picker, the Meals
   rows and Pick from Planned.
4. ~~**Lambda, or a long-running server?**~~ Decided: Lambda. The API is
   request/response only, Hono's handler is a four-line entry file, and
   Fargate would add ~$7 plus an ALB. Cold starts are the price; measure
   before paying anything to remove them.
5. ~~**A bastion for the database?**~~ Decided: not yet. Every laptop task
   (seeds, loading recipes, the restore drill) has a path that doesn't need
   one; the bastion is for the first time prod needs `psql` by hand.
6. ~~**One Postgres role or two?**~~ Decided: one, `app`, for the API and
   the Migrator. Two (a schema owner and a DML-only role) would cost default
   privilege grants for a risk a household app doesn't carry.

## The old app

The React Router web app, the JSON API and the Python agent were removed in the
commit that added this file. Its parent commit, `0afa466`, has all of them:

```bash
git show 0afa466:app/features/recipes/lib/parse-ingredient.ts
git checkout 0afa466 -- app/features/recipes/lib   # restore a folder to read
```
