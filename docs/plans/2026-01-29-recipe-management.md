# Recipe Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete Recipe Management baseline feature - CRUD operations, ingredients, search/filter, and cooking mode UI.

**Architecture:** React Router v7 framework mode with loaders/actions for data flow. PostgreSQL database with raw SQL queries. Zod schemas for validation shared between client and server. Feature-based folder structure.

**Tech Stack:** React Router v7, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Zod, dbmate

---

## Task 1: Project Scaffolding

Set up React Router v7 project with TypeScript.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `app/root.tsx`
- Create: `app/routes.ts`
- Create: `app/routes/home.tsx`
- Create: `react-router.config.ts`

**Step 1: Initialize React Router v7 project**

Run:
```bash
npx create-react-router@latest . --yes
```

Select TypeScript when prompted. This scaffolds the base project.

**Step 2: Verify project runs**

Run:
```bash
npm run dev
```

Expected: Dev server starts, app loads at http://localhost:5173

**Step 3: Commit initial scaffolding**

```bash
git add -A
git commit -m "chore: scaffold React Router v7 project"
```

---

## Task 2: Tailwind CSS Setup

Configure Tailwind CSS (should be included by create-react-router, but verify).

**Files:**
- Verify: `tailwind.config.ts`
- Verify: `app/app.css`

**Step 1: Verify Tailwind is working**

Check that `app/app.css` contains Tailwind directives:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 2: Test Tailwind classes**

Edit `app/routes/home.tsx` to include a Tailwind class:
```tsx
export default function Home() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600">Rotisserie</h1>
      <p className="mt-2 text-gray-600">Plan meals. Shop smarter. Cook. Repeat.</p>
    </div>
  );
}
```

**Step 3: Verify in browser**

Run: `npm run dev`
Expected: Blue heading, gray paragraph text with proper spacing

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify Tailwind CSS setup"
```

---

## Task 3: shadcn/ui Setup

Initialize shadcn/ui for component library.

**Files:**
- Create: `components.json`
- Create: `app/components/ui/button.tsx`
- Modify: `app/app.css` (CSS variables)
- Modify: `tailwind.config.ts` (extend theme)

**Step 1: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init
```

Select:
- Style: Default
- Base color: Slate
- CSS variables: Yes

**Step 2: Add Button component**

Run:
```bash
npx shadcn@latest add button
```

**Step 3: Test Button component**

Edit `app/routes/home.tsx`:
```tsx
import { Button } from "~/components/ui/button";

export default function Home() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Rotisserie</h1>
      <p className="mt-2 text-gray-600">Plan meals. Shop smarter. Cook. Repeat.</p>
      <Button className="mt-4">Get Started</Button>
    </div>
  );
}
```

**Step 4: Verify in browser**

Expected: Styled button appears below text

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui with Button component"
```

---

## Task 4: PostgreSQL and Database Connection

Set up PostgreSQL connection and dbmate for migrations.

**Files:**
- Create: `app/db/connection.ts`
- Create: `.env.example`
- Modify: `.env` (local, gitignored)
- Create: `database.yml` (dbmate config)

**Step 1: Install dependencies**

Run:
```bash
npm install pg
npm install -D @types/pg
```

**Step 2: Install dbmate**

Run:
```bash
brew install dbmate
```

**Step 3: Create .env.example**

Create `.env.example`:
```
DATABASE_URL=postgres://localhost:5432/rotisserie_dev
```

**Step 4: Create local .env**

Create `.env`:
```
DATABASE_URL=postgres://localhost:5432/rotisserie_dev
```

**Step 5: Create database**

Run:
```bash
createdb rotisserie_dev
```

**Step 6: Create database connection module**

Create `app/db/connection.ts`:
```typescript
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T>(
  text: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(
  text: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export { pool };
```

**Step 7: Test connection**

Create a temporary test file `app/db/test-connection.ts`:
```typescript
import { query } from "./connection";

async function test() {
  const result = await query<{ now: Date }>("SELECT NOW()");
  console.log("Database connected:", result[0].now);
  process.exit(0);
}

test().catch(console.error);
```

Run:
```bash
npx tsx app/db/test-connection.ts
```

Expected: Prints current timestamp

**Step 8: Remove test file and commit**

```bash
rm app/db/test-connection.ts
git add -A
git commit -m "feat: add PostgreSQL connection with dbmate"
```

---

## Task 5: Database Schema - Recipes Table

Create the recipes table migration.

**Files:**
- Create: `db/migrations/YYYYMMDDHHMMSS_create_recipes.sql`

**Step 1: Create migration**

Run:
```bash
dbmate new create_recipes
```

**Step 2: Write migration**

Edit the created migration file in `db/migrations/`:
```sql
-- migrate:up
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings INTEGER,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recipes_name ON recipes(name);
CREATE INDEX idx_recipes_created_at ON recipes(created_at);

-- migrate:down
DROP TABLE recipes;
```

**Step 3: Run migration**

Run:
```bash
dbmate up
```

Expected: Migration applies successfully

**Step 4: Verify table exists**

Run:
```bash
psql rotisserie_dev -c "\d recipes"
```

Expected: Shows recipes table schema

**Step 5: Commit**

```bash
git add db/
git commit -m "feat: add recipes table migration"
```

---

## Task 6: Database Schema - Ingredients Table

Create ingredients table with many-to-many relationship to recipes.

**Files:**
- Create: `db/migrations/YYYYMMDDHHMMSS_create_ingredients.sql`

**Step 1: Create migration**

Run:
```bash
dbmate new create_ingredients
```

**Step 2: Write migration**

Edit the migration file:
```sql
-- migrate:up
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity DECIMAL(10, 2),
  unit VARCHAR(50),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(recipe_id, ingredient_id)
);

CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);

-- migrate:down
DROP TABLE recipe_ingredients;
DROP TABLE ingredients;
```

**Step 3: Run migration**

Run:
```bash
dbmate up
```

**Step 4: Commit**

```bash
git add db/
git commit -m "feat: add ingredients and recipe_ingredients tables"
```

---

## Task 7: Database Schema - Tags Table

Create tags table with many-to-many relationship to recipes.

**Files:**
- Create: `db/migrations/YYYYMMDDHHMMSS_create_tags.sql`

**Step 1: Create migration**

Run:
```bash
dbmate new create_tags
```

**Step 2: Write migration**

Edit the migration file:
```sql
-- migrate:up
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recipe_tags (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_recipe_tags_tag_id ON recipe_tags(tag_id);

-- migrate:down
DROP TABLE recipe_tags;
DROP TABLE tags;
```

**Step 3: Run migration**

Run:
```bash
dbmate up
```

**Step 4: Commit**

```bash
git add db/
git commit -m "feat: add tags and recipe_tags tables"
```

---

## Task 8: Zod Schemas for Recipes

Define Zod schemas for recipe validation.

**Files:**
- Create: `app/features/recipes/schemas/recipe.ts`
- Create: `app/features/recipes/schemas/ingredient.ts`

**Step 1: Install Zod**

Run:
```bash
npm install zod
```

**Step 2: Create recipe schema**

Create `app/features/recipes/schemas/recipe.ts`:
```typescript
import { z } from "zod";

export const recipeIngredientSchema = z.object({
  ingredientName: z.string().min(1, "Ingredient name is required"),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required").max(255),
  instructions: z.string().min(1, "Instructions are required"),
  prepTimeMinutes: z.number().int().positive().nullable(),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  sourceUrl: z.string().url().nullable().or(z.literal("")),
  notes: z.string().nullable(),
  ingredients: z.array(recipeIngredientSchema).min(1, "At least one ingredient is required"),
  tags: z.array(z.string().min(1)).default([]),
});

export const updateRecipeSchema = createRecipeSchema.partial().extend({
  id: z.string().uuid(),
});

export const recipeFilterSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ingredientIds: z.array(z.string().uuid()).optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeFilter = z.infer<typeof recipeFilterSchema>;
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Zod schemas for recipe validation"
```

---

## Task 9: Recipe Database Queries

Create SQL query functions for recipes.

**Files:**
- Create: `app/features/recipes/queries/recipes.ts`

**Step 1: Create recipe queries**

Create `app/features/recipes/queries/recipes.ts`:
```typescript
import { query, queryOne } from "~/db/connection";
import type { CreateRecipeInput, RecipeFilter } from "../schemas/recipe";

export interface Recipe {
  id: string;
  name: string;
  instructions: string;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeWithDetails extends Recipe {
  ingredients: {
    id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
    sortOrder: number;
  }[];
  tags: { id: string; name: string }[];
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const recipe = await queryOne<Recipe>(
    `INSERT INTO recipes (name, instructions, prep_time_minutes, cook_time_minutes, servings, source_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, instructions, prep_time_minutes as "prepTimeMinutes",
               cook_time_minutes as "cookTimeMinutes", servings, source_url as "sourceUrl",
               notes, created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.name,
      input.instructions,
      input.prepTimeMinutes,
      input.cookTimeMinutes,
      input.servings,
      input.sourceUrl || null,
      input.notes,
    ]
  );

  if (!recipe) throw new Error("Failed to create recipe");

  // Insert ingredients
  for (let i = 0; i < input.ingredients.length; i++) {
    const ing = input.ingredients[i];

    // Upsert ingredient
    const ingredient = await queryOne<{ id: string }>(
      `INSERT INTO ingredients (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [ing.ingredientName.toLowerCase().trim()]
    );

    if (ingredient) {
      await query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [recipe.id, ingredient.id, ing.quantity, ing.unit, ing.notes, i]
      );
    }
  }

  // Insert tags
  for (const tagName of input.tags) {
    const tag = await queryOne<{ id: string }>(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tagName.toLowerCase().trim()]
    );

    if (tag) {
      await query(
        `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [recipe.id, tag.id]
      );
    }
  }

  return recipe;
}

export async function getRecipeById(id: string): Promise<RecipeWithDetails | null> {
  const recipe = await queryOne<Recipe>(
    `SELECT id, name, instructions, prep_time_minutes as "prepTimeMinutes",
            cook_time_minutes as "cookTimeMinutes", servings, source_url as "sourceUrl",
            notes, created_at as "createdAt", updated_at as "updatedAt"
     FROM recipes WHERE id = $1`,
    [id]
  );

  if (!recipe) return null;

  const ingredients = await query<{
    id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
    sortOrder: number;
  }>(
    `SELECT i.id, i.name, ri.quantity, ri.unit, ri.notes, ri.sort_order as "sortOrder"
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.sort_order`,
    [id]
  );

  const tags = await query<{ id: string; name: string }>(
    `SELECT t.id, t.name
     FROM recipe_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE rt.recipe_id = $1
     ORDER BY t.name`,
    [id]
  );

  return { ...recipe, ingredients, tags };
}

export async function listRecipes(filter?: RecipeFilter): Promise<Recipe[]> {
  let sql = `
    SELECT DISTINCT r.id, r.name, r.instructions, r.prep_time_minutes as "prepTimeMinutes",
           r.cook_time_minutes as "cookTimeMinutes", r.servings, r.source_url as "sourceUrl",
           r.notes, r.created_at as "createdAt", r.updated_at as "updatedAt"
    FROM recipes r
  `;

  const conditions: string[] = [];
  const params: (string | string[])[] = [];
  let paramIndex = 1;

  if (filter?.search) {
    conditions.push(`r.name ILIKE $${paramIndex}`);
    params.push(`%${filter.search}%`);
    paramIndex++;
  }

  if (filter?.tags && filter.tags.length > 0) {
    sql += ` JOIN recipe_tags rt ON rt.recipe_id = r.id JOIN tags t ON t.id = rt.tag_id`;
    conditions.push(`t.name = ANY($${paramIndex})`);
    params.push(filter.tags);
    paramIndex++;
  }

  if (filter?.ingredientIds && filter.ingredientIds.length > 0) {
    sql += ` JOIN recipe_ingredients ri ON ri.recipe_id = r.id`;
    conditions.push(`ri.ingredient_id = ANY($${paramIndex})`);
    params.push(filter.ingredientIds);
    paramIndex++;
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  sql += ` ORDER BY r.created_at DESC`;

  return query<Recipe>(sql, params);
}

export async function updateRecipe(
  id: string,
  input: Partial<CreateRecipeInput>
): Promise<Recipe | null> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.instructions !== undefined) {
    fields.push(`instructions = $${paramIndex++}`);
    values.push(input.instructions);
  }
  if (input.prepTimeMinutes !== undefined) {
    fields.push(`prep_time_minutes = $${paramIndex++}`);
    values.push(input.prepTimeMinutes);
  }
  if (input.cookTimeMinutes !== undefined) {
    fields.push(`cook_time_minutes = $${paramIndex++}`);
    values.push(input.cookTimeMinutes);
  }
  if (input.servings !== undefined) {
    fields.push(`servings = $${paramIndex++}`);
    values.push(input.servings);
  }
  if (input.sourceUrl !== undefined) {
    fields.push(`source_url = $${paramIndex++}`);
    values.push(input.sourceUrl || null);
  }
  if (input.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    values.push(input.notes);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const recipe = await queryOne<Recipe>(
    `UPDATE recipes SET ${fields.join(", ")} WHERE id = $${paramIndex}
     RETURNING id, name, instructions, prep_time_minutes as "prepTimeMinutes",
               cook_time_minutes as "cookTimeMinutes", servings, source_url as "sourceUrl",
               notes, created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  if (!recipe) return null;

  // Update ingredients if provided
  if (input.ingredients !== undefined) {
    await query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [id]);

    for (let i = 0; i < input.ingredients.length; i++) {
      const ing = input.ingredients[i];
      const ingredient = await queryOne<{ id: string }>(
        `INSERT INTO ingredients (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [ing.ingredientName.toLowerCase().trim()]
      );

      if (ingredient) {
        await query(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, ingredient.id, ing.quantity, ing.unit, ing.notes, i]
        );
      }
    }
  }

  // Update tags if provided
  if (input.tags !== undefined) {
    await query(`DELETE FROM recipe_tags WHERE recipe_id = $1`, [id]);

    for (const tagName of input.tags) {
      const tag = await queryOne<{ id: string }>(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tagName.toLowerCase().trim()]
      );

      if (tag) {
        await query(
          `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, tag.id]
        );
      }
    }
  }

  return recipe;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM recipes WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.length > 0;
}

export async function getAllTags(): Promise<{ id: string; name: string }[]> {
  return query(`SELECT id, name FROM tags ORDER BY name`);
}

export async function getAllIngredients(): Promise<{ id: string; name: string }[]> {
  return query(`SELECT id, name FROM ingredients ORDER BY name`);
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add recipe database queries"
```

---

## Task 10: Recipe Routes - List and Create

Create routes for listing and creating recipes.

**Files:**
- Create: `app/features/recipes/routes/recipes.tsx`
- Modify: `app/routes.ts`

**Step 1: Add shadcn components needed**

Run:
```bash
npx shadcn@latest add card input label textarea badge
```

**Step 2: Create recipes list/create route**

Create `app/features/recipes/routes/recipes.tsx`:
```tsx
import { data, Form, useLoaderData, useActionData, redirect } from "react-router";
import type { Route } from "./+types/recipes";
import { listRecipes, createRecipe, getAllTags } from "../queries/recipes";
import { createRecipeSchema } from "../schemas/recipe";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Link } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const tagsParam = url.searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",") : undefined;

  const [recipes, allTags] = await Promise.all([
    listRecipes({ search, tags }),
    getAllTags(),
  ]);

  return { recipes, allTags, filters: { search, tags } };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const ingredientsJson = formData.get("ingredients") as string;
  const tagsJson = formData.get("tags") as string;

  const input = {
    name: formData.get("name") as string,
    instructions: formData.get("instructions") as string,
    prepTimeMinutes: formData.get("prepTimeMinutes")
      ? Number(formData.get("prepTimeMinutes"))
      : null,
    cookTimeMinutes: formData.get("cookTimeMinutes")
      ? Number(formData.get("cookTimeMinutes"))
      : null,
    servings: formData.get("servings") ? Number(formData.get("servings")) : null,
    sourceUrl: (formData.get("sourceUrl") as string) || null,
    notes: (formData.get("notes") as string) || null,
    ingredients: ingredientsJson ? JSON.parse(ingredientsJson) : [],
    tags: tagsJson ? JSON.parse(tagsJson) : [],
  };

  const result = createRecipeSchema.safeParse(input);

  if (!result.success) {
    return data(
      { errors: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const recipe = await createRecipe(result.data);
  return redirect(`/recipes/${recipe.id}`);
}

export default function RecipesPage() {
  const { recipes, allTags, filters } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <Link to="/recipes/new">
          <Button>Add Recipe</Button>
        </Link>
      </div>

      {/* Search and Filter */}
      <Form method="get" className="mb-6">
        <div className="flex gap-4">
          <Input
            name="search"
            placeholder="Search recipes..."
            defaultValue={filters.search}
            className="max-w-sm"
          />
          <Button type="submit">Search</Button>
        </div>
        {allTags.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {allTags.map((tag) => (
              <Badge
                key={tag.id}
                variant={filters.tags?.includes(tag.name) ? "default" : "outline"}
                className="cursor-pointer"
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </Form>

      {/* Recipe List */}
      {recipes.length === 0 ? (
        <p className="text-gray-500">No recipes found. Add your first recipe!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle>{recipe.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-500 space-y-1">
                    {recipe.prepTimeMinutes && (
                      <p>Prep: {recipe.prepTimeMinutes} min</p>
                    )}
                    {recipe.cookTimeMinutes && (
                      <p>Cook: {recipe.cookTimeMinutes} min</p>
                    )}
                    {recipe.servings && <p>Servings: {recipe.servings}</p>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Register route**

Update `app/routes.ts`:
```typescript
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
] satisfies RouteConfig;
```

**Step 4: Verify route loads**

Run: `npm run dev`
Navigate to: http://localhost:5173/recipes
Expected: Recipes page loads with empty state

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recipes list page with search"
```

---

## Task 11: Recipe Routes - New Recipe Form

Create the new recipe form page.

**Files:**
- Create: `app/features/recipes/routes/recipes.new.tsx`
- Modify: `app/routes.ts`

**Step 1: Add more shadcn components**

Run:
```bash
npx shadcn@latest add select
```

**Step 2: Create new recipe page**

Create `app/features/recipes/routes/recipes.new.tsx`:
```tsx
import { useState } from "react";
import { Form, redirect, useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/recipes.new";
import { createRecipe } from "../queries/recipes";
import { createRecipeSchema, type RecipeIngredient } from "../schemas/recipe";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { data } from "react-router";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const ingredientsJson = formData.get("ingredients") as string;
  const tagsJson = formData.get("tags") as string;

  const input = {
    name: formData.get("name") as string,
    instructions: formData.get("instructions") as string,
    prepTimeMinutes: formData.get("prepTimeMinutes")
      ? Number(formData.get("prepTimeMinutes"))
      : null,
    cookTimeMinutes: formData.get("cookTimeMinutes")
      ? Number(formData.get("cookTimeMinutes"))
      : null,
    servings: formData.get("servings") ? Number(formData.get("servings")) : null,
    sourceUrl: (formData.get("sourceUrl") as string) || null,
    notes: (formData.get("notes") as string) || null,
    ingredients: ingredientsJson ? JSON.parse(ingredientsJson) : [],
    tags: tagsJson ? JSON.parse(tagsJson) : [],
  };

  const result = createRecipeSchema.safeParse(input);

  if (!result.success) {
    return data(
      { errors: result.error.flatten().fieldErrors, input },
      { status: 400 }
    );
  }

  const recipe = await createRecipe(result.data);
  return redirect(`/recipes/${recipe.id}`);
}

export default function NewRecipePage() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([
    { ingredientName: "", quantity: null, unit: null, notes: null },
  ]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { ingredientName: "", quantity: null, unit: null, notes: null },
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: string | number | null) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">New Recipe</h1>

      <Form method="post">
        <input type="hidden" name="ingredients" value={JSON.stringify(ingredients)} />
        <input type="hidden" name="tags" value={JSON.stringify(tags)} />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Recipe Name *</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={actionData?.input?.name}
              />
              {actionData?.errors?.name && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.name[0]}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="prepTimeMinutes">Prep Time (min)</Label>
                <Input
                  id="prepTimeMinutes"
                  name="prepTimeMinutes"
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="cookTimeMinutes">Cook Time (min)</Label>
                <Input
                  id="cookTimeMinutes"
                  name="cookTimeMinutes"
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input id="servings" name="servings" type="number" min="1" />
              </div>
            </div>

            <div>
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://..."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ingredients *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingredients.map((ing, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    placeholder="Ingredient name"
                    value={ing.ingredientName}
                    onChange={(e) => updateIngredient(index, "ingredientName", e.target.value)}
                    required
                  />
                </div>
                <div className="w-20">
                  <Input
                    placeholder="Qty"
                    type="number"
                    step="0.01"
                    value={ing.quantity ?? ""}
                    onChange={(e) => updateIngredient(index, "quantity", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="w-24">
                  <Input
                    placeholder="Unit"
                    value={ing.unit ?? ""}
                    onChange={(e) => updateIngredient(index, "unit", e.target.value || null)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeIngredient(index)}
                  disabled={ingredients.length === 1}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addIngredient}>
              + Add Ingredient
            </Button>
            {actionData?.errors?.ingredients && (
              <p className="text-red-500 text-sm">{actionData.errors.ingredients[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-gray-200 px-2 py-1 rounded text-sm flex items-center gap-1"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Instructions *</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="instructions"
              rows={10}
              placeholder="Enter cooking instructions..."
              required
              defaultValue={actionData?.input?.instructions}
            />
            {actionData?.errors?.instructions && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.instructions[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              rows={4}
              placeholder="Personal notes about this recipe..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit">Save Recipe</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </Form>
    </div>
  );
}
```

**Step 3: Register route**

Update `app/routes.ts`:
```typescript
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
] satisfies RouteConfig;
```

**Step 4: Verify form loads**

Run: `npm run dev`
Navigate to: http://localhost:5173/recipes/new
Expected: Recipe form renders with all fields

**Step 5: Test creating a recipe**

Fill out the form and submit. Should redirect to recipe detail page (will 404 for now - that's expected).

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add new recipe form page"
```

---

## Task 12: Recipe Routes - View Single Recipe

Create the recipe detail page.

**Files:**
- Create: `app/features/recipes/routes/recipes.$id.tsx`
- Modify: `app/routes.ts`

**Step 1: Create recipe detail page**

Create `app/features/recipes/routes/recipes.$id.tsx`:
```tsx
import { useLoaderData, Link, Form, redirect } from "react-router";
import type { Route } from "./+types/recipes.$id";
import { getRecipeById, deleteRecipe } from "../queries/recipes";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    await deleteRecipe(params.id);
    return redirect("/recipes");
  }

  return null;
}

export default function RecipeDetailPage() {
  const { recipe } = useLoaderData<typeof loader>();

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link to="/recipes" className="text-blue-600 hover:underline text-sm">
            ← Back to Recipes
          </Link>
          <h1 className="text-3xl font-bold mt-2">{recipe.name}</h1>
          {recipe.tags.length > 0 && (
            <div className="flex gap-2 mt-2">
              {recipe.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/recipes/${recipe.id}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <Link to={`/recipes/${recipe.id}/cook`}>
            <Button>Cooking Mode</Button>
          </Link>
        </div>
      </div>

      {/* Time and Servings */}
      <div className="flex gap-6 mb-6 text-sm text-gray-600">
        {recipe.prepTimeMinutes && <span>Prep: {recipe.prepTimeMinutes} min</span>}
        {recipe.cookTimeMinutes && <span>Cook: {recipe.cookTimeMinutes} min</span>}
        {totalTime > 0 && <span className="font-medium">Total: {totalTime} min</span>}
        {recipe.servings && <span>Servings: {recipe.servings}</span>}
      </div>

      {recipe.sourceUrl && (
        <p className="mb-6 text-sm">
          Source:{" "}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {recipe.sourceUrl}
          </a>
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Ingredients */}
        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex justify-between">
                  <span>{ing.name}</span>
                  <span className="text-gray-500">
                    {ing.quantity && `${ing.quantity}`}
                    {ing.unit && ` ${ing.unit}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap">{recipe.instructions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {recipe.notes && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{recipe.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Delete */}
      <div className="mt-8 pt-8 border-t">
        <Form method="post" onSubmit={(e) => {
          if (!confirm("Are you sure you want to delete this recipe?")) {
            e.preventDefault();
          }
        }}>
          <input type="hidden" name="intent" value="delete" />
          <Button type="submit" variant="destructive">
            Delete Recipe
          </Button>
        </Form>
      </div>
    </div>
  );
}
```

**Step 2: Register route**

Update `app/routes.ts`:
```typescript
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
  route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),
] satisfies RouteConfig;
```

**Step 3: Verify page loads**

Create a test recipe, then navigate to its detail page.
Expected: Recipe details displayed with ingredients and instructions

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add recipe detail page with delete"
```

---

## Task 13: Recipe Routes - Edit Recipe

Create the edit recipe page.

**Files:**
- Create: `app/features/recipes/routes/recipes.$id.edit.tsx`
- Modify: `app/routes.ts`

**Step 1: Create edit recipe page**

Create `app/features/recipes/routes/recipes.$id.edit.tsx`:
```tsx
import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/recipes.$id.edit";
import { getRecipeById, updateRecipe } from "../queries/recipes";
import { createRecipeSchema, type RecipeIngredient } from "../schemas/recipe";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { data } from "react-router";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();

  const ingredientsJson = formData.get("ingredients") as string;
  const tagsJson = formData.get("tags") as string;

  const input = {
    name: formData.get("name") as string,
    instructions: formData.get("instructions") as string,
    prepTimeMinutes: formData.get("prepTimeMinutes")
      ? Number(formData.get("prepTimeMinutes"))
      : null,
    cookTimeMinutes: formData.get("cookTimeMinutes")
      ? Number(formData.get("cookTimeMinutes"))
      : null,
    servings: formData.get("servings") ? Number(formData.get("servings")) : null,
    sourceUrl: (formData.get("sourceUrl") as string) || null,
    notes: (formData.get("notes") as string) || null,
    ingredients: ingredientsJson ? JSON.parse(ingredientsJson) : [],
    tags: tagsJson ? JSON.parse(tagsJson) : [],
  };

  const result = createRecipeSchema.safeParse(input);

  if (!result.success) {
    return data(
      { errors: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  await updateRecipe(params.id, result.data);
  return redirect(`/recipes/${params.id}`);
}

export default function EditRecipePage() {
  const { recipe } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    recipe.ingredients.map((ing) => ({
      ingredientName: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      notes: ing.notes,
    }))
  );
  const [tags, setTags] = useState<string[]>(recipe.tags.map((t) => t.name));
  const [tagInput, setTagInput] = useState("");

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { ingredientName: "", quantity: null, unit: null, notes: null },
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: string | number | null) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Edit Recipe</h1>

      <Form method="post">
        <input type="hidden" name="ingredients" value={JSON.stringify(ingredients)} />
        <input type="hidden" name="tags" value={JSON.stringify(tags)} />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Recipe Name *</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={recipe.name}
              />
              {actionData?.errors?.name && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.name[0]}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="prepTimeMinutes">Prep Time (min)</Label>
                <Input
                  id="prepTimeMinutes"
                  name="prepTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue={recipe.prepTimeMinutes ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="cookTimeMinutes">Cook Time (min)</Label>
                <Input
                  id="cookTimeMinutes"
                  name="cookTimeMinutes"
                  type="number"
                  min="0"
                  defaultValue={recipe.cookTimeMinutes ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min="1"
                  defaultValue={recipe.servings ?? ""}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://..."
                defaultValue={recipe.sourceUrl ?? ""}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ingredients *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingredients.map((ing, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    placeholder="Ingredient name"
                    value={ing.ingredientName}
                    onChange={(e) => updateIngredient(index, "ingredientName", e.target.value)}
                    required
                  />
                </div>
                <div className="w-20">
                  <Input
                    placeholder="Qty"
                    type="number"
                    step="0.01"
                    value={ing.quantity ?? ""}
                    onChange={(e) => updateIngredient(index, "quantity", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="w-24">
                  <Input
                    placeholder="Unit"
                    value={ing.unit ?? ""}
                    onChange={(e) => updateIngredient(index, "unit", e.target.value || null)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeIngredient(index)}
                  disabled={ingredients.length === 1}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addIngredient}>
              + Add Ingredient
            </Button>
            {actionData?.errors?.ingredients && (
              <p className="text-red-500 text-sm">{actionData.errors.ingredients[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-gray-200 px-2 py-1 rounded text-sm flex items-center gap-1"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Instructions *</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="instructions"
              rows={10}
              placeholder="Enter cooking instructions..."
              required
              defaultValue={recipe.instructions}
            />
            {actionData?.errors?.instructions && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.instructions[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              rows={4}
              placeholder="Personal notes about this recipe..."
              defaultValue={recipe.notes ?? ""}
            />
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit">Save Changes</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </Form>
    </div>
  );
}
```

**Step 2: Register route**

Update `app/routes.ts`:
```typescript
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
  route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),
  route("recipes/:id/edit", "features/recipes/routes/recipes.$id.edit.tsx"),
] satisfies RouteConfig;
```

**Step 3: Verify edit works**

Navigate to a recipe, click Edit, make changes, save.
Expected: Changes persist after save

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add recipe edit page"
```

---

## Task 14: Cooking Mode

Create the cooking mode view for hands-free recipe following.

**Files:**
- Create: `app/features/recipes/routes/recipes.$id.cook.tsx`
- Modify: `app/routes.ts`

**Step 1: Create cooking mode page**

Create `app/features/recipes/routes/recipes.$id.cook.tsx`:
```tsx
import { useState } from "react";
import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/recipes.$id.cook";
import { getRecipeById } from "../queries/recipes";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  // Parse instructions into steps (split by newlines or numbered items)
  const steps = recipe.instructions
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^\d+[\.\)]\s*/, "")); // Remove leading numbers

  return { recipe, steps };
}

export default function CookingModePage() {
  const { recipe, steps } = useLoaderData<typeof loader>();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [showIngredients, setShowIngredients] = useState(false);

  const toggleStepComplete = (index: number) => {
    const updated = new Set(completedSteps);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setCompletedSteps(updated);
  };

  const goToNextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <Link to={`/recipes/${recipe.id}`} className="text-gray-300 hover:text-white">
          ← Exit Cooking Mode
        </Link>
        <h1 className="text-xl font-bold">{recipe.name}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowIngredients(!showIngredients)}
          className="text-black"
        >
          {showIngredients ? "Hide" : "Show"} Ingredients
        </Button>
      </div>

      {/* Ingredients Panel */}
      {showIngredients && (
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <h2 className="text-lg font-semibold mb-2">Ingredients</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {recipe.ingredients.map((ing) => (
              <div key={ing.id} className="flex justify-between">
                <span>{ing.name}</span>
                <span className="text-gray-400">
                  {ing.quantity && `${ing.quantity}`}
                  {ing.unit && ` ${ing.unit}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content - Current Step */}
      <div className="flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{completedSteps.size} completed</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Current Step */}
          <Card className="bg-gray-800 border-gray-700 mb-8">
            <CardContent className="p-8">
              <p className="text-2xl md:text-3xl leading-relaxed">
                {steps[currentStep]}
              </p>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={goToPrevStep}
              disabled={currentStep === 0}
              className="text-black"
            >
              ← Previous
            </Button>

            <Button
              variant={completedSteps.has(currentStep) ? "secondary" : "default"}
              size="lg"
              onClick={() => toggleStepComplete(currentStep)}
            >
              {completedSteps.has(currentStep) ? "✓ Done" : "Mark Done"}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={goToNextStep}
              disabled={currentStep === steps.length - 1}
              className="text-black"
            >
              Next →
            </Button>
          </div>
        </div>
      </div>

      {/* Step Overview */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold mb-2 text-gray-400">All Steps</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                  ${index === currentStep
                    ? "bg-blue-600 text-white"
                    : completedSteps.has(index)
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
              >
                {completedSteps.has(index) ? "✓" : index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Register route**

Update `app/routes.ts`:
```typescript
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "features/recipes/routes/recipes.tsx"),
  route("recipes/new", "features/recipes/routes/recipes.new.tsx"),
  route("recipes/:id", "features/recipes/routes/recipes.$id.tsx"),
  route("recipes/:id/edit", "features/recipes/routes/recipes.$id.edit.tsx"),
  route("recipes/:id/cook", "features/recipes/routes/recipes.$id.cook.tsx"),
] satisfies RouteConfig;
```

**Step 3: Verify cooking mode works**

Navigate to a recipe with multi-line instructions, click "Cooking Mode".
Expected: Dark UI with large text, step navigation, progress tracking

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add cooking mode for hands-free recipe following"
```

---

## Task 15: Update Home Page

Update the home page to link to recipes.

**Files:**
- Modify: `app/routes/home.tsx`

**Step 1: Update home page**

Edit `app/routes/home.tsx`:
```tsx
import { Link } from "react-router";
import { Button } from "~/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">Rotisserie</h1>
      <p className="text-gray-600 mb-8">Plan meals. Shop smarter. Cook. Repeat.</p>

      <div className="flex gap-4">
        <Link to="/recipes">
          <Button size="lg">View Recipes</Button>
        </Link>
        <Link to="/recipes/new">
          <Button size="lg" variant="outline">Add Recipe</Button>
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Navigate to http://localhost:5173/
Expected: Home page with links to recipes

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: update home page with recipe links"
```

---

## Task 16: Final Testing and Cleanup

Verify all features work end-to-end.

**Step 1: Run full test flow**

1. Start dev server: `npm run dev`
2. Go to http://localhost:5173/
3. Click "Add Recipe"
4. Fill out form with test data:
   - Name: "Test Pasta"
   - Prep: 10, Cook: 20, Servings: 4
   - Ingredients: pasta (1 lb), sauce (2 cups), cheese (1 cup)
   - Tags: italian, quick
   - Instructions: Multi-line steps
5. Save and verify redirect to detail page
6. Test "Cooking Mode" - navigate steps, mark done
7. Test "Edit" - make changes, save
8. Go back to recipes list - verify search works
9. Delete recipe - verify removed from list

**Step 2: Type check**

Run:
```bash
npm run typecheck
```

Fix any TypeScript errors.

**Step 3: Build check**

Run:
```bash
npm run build
```

Expected: Build succeeds

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## Summary

This plan implements the complete Recipe Management baseline:

- **Database**: PostgreSQL with recipes, ingredients, and tags tables
- **Data layer**: Raw SQL queries with Zod validation
- **Routes**:
  - `/recipes` - List all recipes with search/filter
  - `/recipes/new` - Create new recipe
  - `/recipes/:id` - View recipe details
  - `/recipes/:id/edit` - Edit recipe
  - `/recipes/:id/cook` - Cooking mode

Total: 16 tasks, approximately 50-60 granular steps.
