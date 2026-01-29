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

    // Upsert ingredient with proper capitalization
    const trimmedName = ing.ingredientName.trim();
    const capitalizedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase();
    const ingredient = await queryOne<{ id: string }>(
      `INSERT INTO ingredients (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [capitalizedName]
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
      // Capitalize ingredient name
      const trimmedName = ing.ingredientName.trim();
      const capitalizedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase();
      const ingredient = await queryOne<{ id: string }>(
        `INSERT INTO ingredients (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [capitalizedName]
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

export interface Unit {
  id: string;
  name: string;
  abbreviation: string | null;
  category: string | null;
}

export async function getAllUnits(): Promise<Unit[]> {
  return query(`SELECT id, name, abbreviation, category FROM units ORDER BY category, name`);
}
