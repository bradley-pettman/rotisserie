import { DB } from "~/db/connection";
import type { QueryFns } from "~/db/connection";
import type { CreateCookInput, MealSlot } from "../schemas/cook";

/**
 * A cook is a FACT -- append-only history of what was actually made, and when.
 * It is not a meal plan item, which is an intention that may never happen.
 *
 * `label` is a snapshot of the recipe's name taken at log time, so history
 * survives the recipe being renamed or deleted (recipe_id is ON DELETE SET
 * NULL). Read the label, never a join, when displaying history.
 */
export interface Cook {
  id: string;
  recipeId: string | null;
  label: string;
  cookedOn: Date;
  mealSlot: MealSlot;
  servingsMade: number | null;
  notes: string | null;
  isLeftovers: boolean;
  createdAt: Date;
}

async function insertCook(db: QueryFns, input: CreateCookInput, label: string): Promise<Cook> {
  const cook = await db.queryOne<Cook>(
    `INSERT INTO cooks (recipe_id, label, cooked_on, meal_slot, servings_made, notes, is_leftovers)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, recipe_id as "recipeId", label, cooked_on as "cookedOn",
               meal_slot as "mealSlot", servings_made as "servingsMade", notes,
               is_leftovers as "isLeftovers", created_at as "createdAt"`,
    [
      input.recipeId,
      label,
      input.cookedOn,
      input.mealSlot,
      input.servingsMade,
      input.notes,
      input.isLeftovers,
    ]
  );

  if (!cook) throw new Error("Failed to log cook");

  return cook;
}

export async function logCook(input: CreateCookInput): Promise<Cook> {
  const label = input.label.trim();

  // A label was supplied, so there is nothing to look up: one insert, no
  // transaction needed.
  if (label) return insertCook(DB, input, label);

  if (!input.recipeId) {
    throw new Error("A cook needs either a label or a recipeId to snapshot a label from");
  }

  // Blank label against a real recipe: snapshot the recipe's current name.
  // The lookup and the insert share a transaction so a concurrent rename
  // cannot land between them and store a name that never existed together
  // with this cook.
  return DB.withTransaction(async (tx) => {
    const recipe = await tx.queryOne<{ name: string }>(
      `SELECT name FROM recipes WHERE id = $1`,
      [input.recipeId]
    );

    if (!recipe) throw new Error(`Recipe ${input.recipeId} not found`);

    return insertCook(tx, input, recipe.name);
  });
}

/**
 * Everything cooked in the last `days` days, newest first. This is the feed
 * meal planning reads to answer "nothing we've had in the last two weeks", so
 * it deliberately includes `recipeId` (null for takeout / improvised meals)
 * alongside the label, and includes leftovers -- eating a dish again still
 * counts against variety.
 */
export async function getCookingHistory(days: number): Promise<Cook[]> {
  return DB.query<Cook>(
    `SELECT id, recipe_id as "recipeId", label, cooked_on as "cookedOn",
            meal_slot as "mealSlot", servings_made as "servingsMade", notes,
            is_leftovers as "isLeftovers", created_at as "createdAt"
     FROM cooks
     WHERE cooked_on >= CURRENT_DATE - $1::INTEGER
     ORDER BY cooked_on DESC, created_at DESC`,
    [days]
  );
}

/**
 * The last day this recipe was actually made. Leftovers are excluded: eating
 * Tuesday's chili again on Wednesday does not mean you cooked it Wednesday.
 */
export async function lastCookedAt(recipeId: string): Promise<Date | null> {
  const row = await DB.queryOne<{ lastCookedOn: Date | null }>(
    `SELECT MAX(cooked_on) as "lastCookedOn"
     FROM cooks
     WHERE recipe_id = $1 AND is_leftovers = FALSE`,
    [recipeId]
  );

  return row?.lastCookedOn ?? null;
}

/**
 * Batched `lastCookedAt` for list views: one query for the whole page of
 * recipes, never one query per row. Recipes that have never been cooked are
 * simply absent from the map.
 */
export async function lastCookedForRecipes(recipeIds: string[]): Promise<Map<string, Date>> {
  if (recipeIds.length === 0) return new Map();

  const rows = await DB.query<{ recipeId: string; lastCookedOn: Date }>(
    `SELECT recipe_id as "recipeId", MAX(cooked_on) as "lastCookedOn"
     FROM cooks
     WHERE recipe_id = ANY($1::uuid[]) AND is_leftovers = FALSE
     GROUP BY recipe_id`,
    [recipeIds]
  );

  return new Map(rows.map((row) => [row.recipeId, row.lastCookedOn]));
}

export async function deleteCook(id: string): Promise<boolean> {
  const result = await DB.query(
    `DELETE FROM cooks WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.length > 0;
}
