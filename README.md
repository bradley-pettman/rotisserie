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
