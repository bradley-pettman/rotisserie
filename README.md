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
npm run test         # Run E2E tests (Playwright)
npm run test:ui      # Interactive E2E test UI
npm run test:unit    # Run unit tests (Vitest)
npm run test:unit:watch  # Unit tests in watch mode
npm run db:seed      # (Re)load db/seeds/*.sql into $DATABASE_URL
```
