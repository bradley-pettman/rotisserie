# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run start            # Run production server
npm run typecheck        # Generate route types + TypeScript check
npm run lint             # Module boundary rule only (see Architecture rules)

# Testing
npm run test:unit        # Vitest unit tests (app/**/*.test.ts)
npm run test             # Playwright E2E, headless
npm run test:ui          # Interactive test UI
npm run test:headed      # Tests with visible browser

# Database (requires dbmate CLI)
docker-compose up        # Start PostgreSQL
dbmate up                # Run migrations
dbmate down              # Rollback migration
npm run db:seed          # Apply db/seeds (idempotent)
npm run db:demo          # Replace recipes/cooks/plans with a demo library (DESTRUCTIVE)
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
- **JSON API**: `app/routes/api.*.ts` are resource routes — loader/action only, no component. Shared envelopes and method dispatch live in `~/lib/api`; the schemas stay the source of truth for validation

## Project Structure

```
app/
├── features/           # Feature modules — standalone, never import each other
│   ├── recipes/        # Recipes, ingredients, tags, and the cook log
│   │   ├── routes/     # Page components with loaders/actions
│   │   ├── queries/    # SQL query functions (recipes.ts, cooks.ts)
│   │   ├── schemas/    # Zod validation schemas
│   │   ├── lib/        # Pure helpers + their unit tests
│   │   └── components/ # Feature-specific UI (recipe-form, recipe-detail, …)
│   ├── meal-plans/     # Plans and plan items (queries/, schemas/, components/)
│   └── integrations/   # The ONLY code allowed to import two feature modules
│       ├── plan-to-cook.ts      # cook_fulfillments: was the plan actually cooked?
│       └── plan-with-recipes.ts # resolve plan items' recipeIds to names
├── routes/             # Non-feature routes:
│   ├── app-layout.tsx  #   the shell every in-app page nests inside
│   ├── home.tsx        #   `/` → /recipes
│   ├── plan.tsx        #   the planner — cross-module, so it lives out here
│   └── api.*.ts        #   the JSON API
├── components/
│   ├── app-shell.tsx   # Sidebar + PageHeader
│   └── ui/             # shadcn/ui components, plus drawer.tsx and section.tsx
├── db/connection.ts    # PostgreSQL pool + query helpers
├── lib/api.ts          # JSON API response envelopes + method dispatch
├── lib/date.ts         # Calendar-day + duration formatting
├── lib/utils.ts        # cn() helper for Tailwind classes
├── routes.ts           # Route configuration
└── root.tsx            # Root layout/error boundary

db/
├── migrations/         # SQL migration files (run with dbmate)
├── seeds/              # Seed data for ingredients, units
└── demo-data.mjs       # `npm run db:demo` — a populated library to develop against

tests/                  # Playwright E2E specs (unit tests sit next to source)
```

## UI shell

**One shell, one drawer rule.** Every page inside the app nests inside
`routes/app-layout.tsx`, so the sidebar is structural rather than something each
page remembers to render. A new route cannot ship without navigation. Cooking
mode is deliberately outside it — a full-screen mode with one way out.

**Drawers, not modals.** A modal takes the screen away and demands you finish or
cancel. A drawer (`components/ui/drawer.tsx`) sits beside what you were reading,
so the list keeps its scroll and its filters. The rule for choosing:

> A drawer is for ONE decision made against the context behind it.
> A page is for a task.

Reading a recipe, assigning a meal, acting on a planned meal: decisions, so
drawers. Editing a recipe: a task, so a route — nine fields and a repeating
ingredient row do not fit a drawer without becoming a cramped page with a shadow
on it. The `compact`/`default`/`wide` ladder in `drawer.tsx` is where that
judgement gets made; past `wide`, write a route.

**Drawer state lives in the URL.** The recipe drawer is `?recipe=<id>`, not
component state, so it is linkable, survives a reload, and closes on Back.
Closing drops only that parameter, which is what keeps every filter intact.
`/recipes/:id` is kept as a permalink that redirects into the drawer.

**Where a route file goes.** Inside `features/<module>/routes/` when it reads one
module; in `app/routes/` when it crosses two. The planner resolves plan items'
recipe names, so it lives in `app/routes/plan.tsx` for the same reason the
cross-module API routes do — see the module boundary rule below.

## Architecture rules

**Module boundary.** A feature module must work standalone. `app/features/<module>/` may import from `~/db/connection`, `~/components/**`, `~/lib/**` and itself — never from a sibling feature module. Cross-module code lives in `app/features/integrations/`, the only place permitted to import from two modules. Enforced by `npm run lint`, whose eslint config exists for this one rule; adding a module is a one-line edit to `FEATURE_MODULES` there.

Known limit, not a bug: the rule governs *code*, not schema. `meal_plan_items.recipe_id` is a real foreign key to `recipes`, so the modules are independent at the code layer but not the schema layer — the planner cannot be deployed against a database with no `recipes` table. That is a deliberate trade: referential integrity is worth more here than that deployment story.

The cost the rule pushes onto callers is name resolution — a `MealPlanItem` carries a bare `recipeId`, never a recipe name. Use `getMealPlanWithRecipeNames` / `resolveRecipeNames` from `integrations/plan-with-recipes.ts`, which resolve a whole plan in one batched query. Never call `getRecipeById` per item.

**Intent versus fact.** `meal_plan_items` hold INTENTIONS — mutable, and they may never happen. `cooks` hold FACT — append-only history of what was made. Moving Tuesday's tacos to Wednesday is an ordinary edit to an intention and must not rewrite history. This is why the two tables treat a deleted recipe differently, and the asymmetry is deliberate rather than an oversight:

- `cooks.recipe_id` is `ON DELETE SET NULL`, alongside a snapshot `label` column, so deleting (or renaming) a recipe never destroys the record of having cooked it.
- `meal_plan_items.recipe_id` is `ON DELETE CASCADE`, because a *plan* to cook a recipe that no longer exists is meaningless, while the *fact* of having cooked it is not.

Names follow the same split: plan items resolve names live, since an intention should read as the recipe is called today, while cooking history reads `cooks.label` and never joins.

## Database

**Tables**: recipes, ingredients, recipe_ingredients, tags, recipe_tags, units, cooks, meal_plans, meal_plan_items, cook_fulfillments

**Conventions**:
- Ingredients are stored **lowercase and trimmed** — lowercase is the canonical form, matching the seeded vocabulary and `units`. Capitalization is presentation only: apply `capitalizeIngredientName` (`features/recipes/lib/display-name.ts`) at render time, never on the way into the database. Storing a capitalized name forks a duplicate of the seeded row past `ON CONFLICT (name)`; a CHECK constraint (`ingredients_name_is_canonical`) now rejects it outright
- Tags are lowercased and trimmed
- Units are lowercased, trimmed and folded onto a canonical spelling by `canonicalizeUnit` before the upsert
- `NUMERIC` comes back as a **number**, not pg's default string: `app/db/connection.ts` registers one global `pg.types` parser for it. `recipe_ingredients.quantity` is the only NUMERIC column in the schema — adding one that needs arbitrary precision (money) means revisiting that override or selecting the column as `::text`
- UUID primary keys throughout
- DATE columns are calendar dates, not instants: select them as `to_char(col, 'YYYY-MM-DD')` and keep them as strings, or `pg` returns a Date at local midnight and the day shifts either side of UTC
- `meal_slot` uses the same four values (`breakfast`/`lunch`/`dinner`/`snack`) in both `cooks` and `meal_plan_items`, so a cook lines up with the plan item it fulfils
- Batch lookups by id list with `= ANY($1::uuid[])` (see `lastCookedForRecipes`, `getRecipeNamesByIds`) rather than a query per row
- The migrations carry the reasoning behind these tables — read the relevant one before changing a constraint

## Component Library

shadcn/ui with `components.json` config. Add components:
```bash
npx shadcn-ui@latest add <component>
```

Path alias `~/` maps to `/app/` (e.g., `import { Button } from "~/components/ui/button"`)
