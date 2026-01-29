# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run start            # Run production server
npm run typecheck        # Generate route types + TypeScript check

# Testing (E2E with Playwright)
npm run test             # Run tests headless
npm run test:ui          # Interactive test UI
npm run test:headed      # Tests with visible browser

# Database (requires dbmate CLI)
docker-compose up        # Start PostgreSQL
dbmate up                # Run migrations
dbmate down              # Rollback migration
```

## Architecture

**Stack**: React Router v7 (SSR), Tailwind CSS, shadcn/ui, PostgreSQL, raw SQL with pg driver, Zod validation

**Data Flow**:
```
React Components → Loaders/Actions → Raw SQL Queries → PostgreSQL
                                   ↳ Zod Validation
```

**Key Patterns**:
- **Loaders**: Fetch data server-side, accessed via `useLoaderData()`
- **Actions**: Handle form submissions, validate with Zod, redirect on success
- **Progressive enhancement**: Forms work without JavaScript

## Project Structure

```
app/
├── features/           # Feature modules (recipes/, etc.)
│   └── recipes/
│       ├── routes/     # Page components with loaders/actions
│       ├── queries/    # SQL query functions
│       ├── schemas/    # Zod validation schemas
│       └── components/ # Feature-specific UI
├── components/ui/      # shadcn/ui components
├── db/connection.ts    # PostgreSQL pool + query helpers
├── lib/utils.ts        # cn() helper for Tailwind classes
├── routes.ts           # Route configuration
└── root.tsx            # Root layout/error boundary

db/
├── migrations/         # SQL migration files (run with dbmate)
└── seeds/              # Seed data for ingredients, units
```

## Database

**Tables**: recipes, ingredients, recipe_ingredients, tags, recipe_tags, units

**Conventions**:
- Ingredients auto-capitalize (first letter uppercase, rest lowercase)
- Tags are lowercased and trimmed
- UUID primary keys throughout

## Component Library

shadcn/ui with `components.json` config. Add components:
```bash
npx shadcn-ui@latest add <component>
```

Path alias `~/` maps to `/app/` (e.g., `import { Button } from "~/components/ui/button"`)
