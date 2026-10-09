# Rotisserie

<p align="center">
  <img src="docs/logo.png" alt="Rotisserie Logo" width="200" />
</p>

<p align="center">
  <strong>Plan meals. Shop smarter. Cook. Repeat.</strong>
</p>

---

A family meal planner and recipe book, being rebuilt as a mobile app.

Right now this repo is the foundation: the PostgreSQL schema, its migrations
and seeds, and a database connection module. The API and the Expo app come
next. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Getting started

Requires Node 22, Docker, and [dbmate](https://github.com/amacneil/dbmate).

```bash
npm install
cp .env.example .env
docker-compose up -d     # PostgreSQL on localhost:5432
dbmate up                # Create the tables
npm run db:seed          # Load common units and ingredients
```

## Scripts

```bash
npm run typecheck        # TypeScript check
npm test                 # Unit tests (Vitest)
npm run test:watch       # Unit tests in watch mode
npm run db:seed          # (Re)load db/seeds/*.sql
```

## Data model

| Area | Tables |
|---|---|
| Recipe book | `recipes`, `recipe_ingredients`, `recipe_tags`, `ingredients`, `units`, `tags` |
| Plan (what we mean to eat) | `planned_meals`, `planned_meal_dishes` |
| History (what we actually ate) | `cooked_meals`, `cooked_meal_dishes` |

The migrations in `db/migrations/` explain the reasoning behind each table.

## License

See [LICENSE](LICENSE).
