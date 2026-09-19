# Rotisserie

<p align="center">
  <img src="public/logo.png" alt="Rotisserie Logo" width="200" />
</p>

<p align="center">
  <strong>Plan meals. Shop smarter. Cook. Repeat.</strong>
</p>

---

A family-focused meal planning and recipe management application that connects recipe management, meal planning, and grocery shopping into a unified workflow.

## Features

- **Recipe Management** - Store, organize, and access recipes with full CRUD operations
- **Cooking Mode** - Distraction-free, hands-free friendly interface for following recipes
- **Search & Filter** - Find recipes by name, tags, or ingredients

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router v7 (SSR) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL |
| Data Layer | Raw SQL (pg) + Zod validation |
| Testing | Playwright (E2E) + Vitest (unit) |

## Getting Started

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker-compose up -d

# Run migrations
dbmate up

# Load seed data (common ingredients + units)
npm run db:seed

# Start dev server
npm run dev
```

## Development

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # Check feature-module import boundaries (see below)
npm run test         # Run E2E tests (Playwright)
npm run test:ui      # Interactive E2E test UI
npm run test:unit    # Run unit tests (Vitest)
npm run test:unit:watch  # Unit tests in watch mode
npm run db:seed      # (Re)load db/seeds/*.sql into $DATABASE_URL
```

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`,
as two independent jobs that start at the same time:

| Job | What it runs | Needs |
|-----|--------------|-------|
| **Lint, typecheck and unit tests** | `npm run lint`, `npm run typecheck`, `npm run test:unit` | Node 22 only — reports in about a minute |
| **E2E (Playwright)** | `npm run test` (chromium) | A PostgreSQL 16 service container, `dbmate up`, `npm run db:seed`, and Playwright's own Chromium |

The E2E job gets a Postgres service container of its own, so the suite has a
database nothing else is writing to — it runs with `workers: 1` and asserts on
the contents of the recipe list and of the ingredient/unit comboboxes, which
means it needs the seeded vocabulary and nothing more. It loads `db/seeds/`
only; no extra fixtures. `dbmate` is not an npm dependency, so the job
downloads the pinned release binary (version and sha256 are at the top of the
job) and migrates with `--no-dump-schema`.

Retries (2) and `forbidOnly` come from `playwright.config.ts` via `CI=true`,
which GitHub sets; the workflow does not repeat them. When the suite fails, the
HTML report is uploaded as a `playwright-report` artifact (traces from the first
retry are inside it) — download it from the run's summary page. The reporter is
configured with `open: "never"`, because serving the report would hang the job.

## Module boundaries

Each feature module under `app/features/` is meant to stand alone — a recipe
book with no meal planner, a planner with no recipe book. A module may import
from `~/db/connection`, `~/components/**`, `~/lib/**` and from itself, but
**not from a sibling feature module**. Code that links two modules belongs in
`app/features/integrations/`, which is the one module allowed to reach into
several.

`npm run lint` enforces exactly this and nothing else — it is a single
architectural rule, not a general lint setup. It checks resolved paths, so both
`~/features/...` and relative `../../features/...` imports are caught.

Adding a module: add its directory name to `FEATURE_MODULES` at the top of
`eslint.config.js`. That one line walls it off from every existing module in
both directions.
