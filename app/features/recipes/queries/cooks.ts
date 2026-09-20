import { DB } from "~/db/connection";
import type { QueryFns } from "~/db/connection";
import type { CreateCookInput, MealSlot } from "../schemas/cook";
import { isUuid } from "~/lib/uuid";

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
  // A calendar DAY as 'YYYY-MM-DD', not an instant -- see COOK_COLUMNS. Typed
  // as a string because that is what the query returns; a `Date` here would be
  // the lie that hid this bug.
  cookedOn: string;
  mealSlot: MealSlot;
  servingsMade: number | null;
  notes: string | null;
  isLeftovers: boolean;
  createdAt: Date;
}

// cooked_on is a DATE -- a calendar day, not an instant. `pg` decodes DATE
// into a JS Date at LOCAL midnight, so a row stored as 2026-09-19 serializes
// to "2026-09-18T22:00:00.000Z" in Europe/Berlin and any client taking the
// first 10 characters reads the day before. Render the column to text in SQL
// and keep it a 'YYYY-MM-DD' string end to end -- the same shape
// createCookSchema accepts on the way in, and the same treatment
// meal-plans.ts gives starts_on/ends_on/planned_on. to_char rather than ::text
// so the result cannot follow the server's DateStyle.
//
// This is load-bearing for meal planning: getCookingHistory feeds the "nothing
// we have had in two weeks" window, where an off-by-one day silently corrupts
// the answer.
const COOK_COLUMNS = `id, recipe_id as "recipeId", label,
            to_char(cooked_on, 'YYYY-MM-DD') as "cookedOn",
            meal_slot as "mealSlot", servings_made as "servingsMade", notes,
            is_leftovers as "isLeftovers", created_at as "createdAt"`;

async function insertCook(db: QueryFns, input: CreateCookInput, label: string): Promise<Cook> {
  const cook = await db.queryOne<Cook>(
    `INSERT INTO cooks (recipe_id, label, cooked_on, meal_slot, servings_made, notes, is_leftovers)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COOK_COLUMNS}`,
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

/**
 * Log a cook. Returns `null` when the cook names a recipe that does not exist.
 *
 * NULL RATHER THAN THROWING: this is the caller's mistake, not a server fault,
 * and it used to be a plain `Error`, which `apiRoute` could only read as a 500
 * with a stack trace in the log. The asymmetry gave it away -- the same bad id
 * sent WITH a label hit the foreign key instead, and 23503 is in the
 * caller-fault table, so it answered a correct 400. Only the snapshot branch
 * misbehaved, and it was a free anonymous way to fill the error log.
 *
 * `tx` lets a caller run this inside a transaction it already owns, so a cook
 * and whatever else must land with it commit together. Omitted, it opens its
 * own where it needs one.
 */
export async function logCook(
  input: CreateCookInput,
  tx?: QueryFns
): Promise<Cook | null> {
  const label = input.label.trim();

  // A label was supplied, so there is nothing to look up: one insert, no
  // transaction needed.
  if (label) return insertCook(tx ?? DB, input, label);

  if (!input.recipeId) {
    throw new Error("A cook needs either a label or a recipeId to snapshot a label from");
  }

  // Blank label against a real recipe: snapshot the recipe's current name.
  // The lookup and the insert share a transaction so a concurrent rename
  // cannot land between them and store a name that never existed together
  // with this cook.
  const snapshot = async (db: QueryFns): Promise<Cook | null> => {
    const recipe = await db.queryOne<{ name: string }>(
      `SELECT name FROM recipes WHERE id = $1`,
      [input.recipeId]
    );

    if (!recipe) return null;

    return insertCook(db, input, recipe.name);
  };

  return tx ? snapshot(tx) : DB.withTransaction(snapshot);
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
    `SELECT ${COOK_COLUMNS}
     FROM cooks
     WHERE cooked_on >= CURRENT_DATE - $1::INTEGER
     ORDER BY cooked_on DESC, created_at DESC`,
    [days]
  );
}

/**
 * The last day this recipe was actually made, as 'YYYY-MM-DD'. Leftovers are
 * excluded: eating Tuesday's chili again on Wednesday does not mean you cooked
 * it Wednesday.
 *
 * to_char wraps the MAX rather than the column so the aggregate still runs on
 * DATE and picks the latest day, not the lexically largest string.
 */
export async function lastCookedAt(recipeId: string): Promise<string | null> {
  if (!isUuid(recipeId)) return null;

  const row = await DB.queryOne<{ lastCookedOn: string | null }>(
    `SELECT to_char(MAX(cooked_on), 'YYYY-MM-DD') as "lastCookedOn"
     FROM cooks
     WHERE recipe_id = $1 AND is_leftovers = FALSE`,
    [recipeId]
  );

  return row?.lastCookedOn ?? null;
}

/**
 * Batched `lastCookedAt` for list views: one query for the whole page of
 * recipes, never one query per row. Recipes that have never been cooked are
 * simply absent from the map. Values are 'YYYY-MM-DD' strings, matching
 * `lastCookedAt`.
 */
export async function lastCookedForRecipes(recipeIds: string[]): Promise<Map<string, string>> {
  if (recipeIds.length === 0) return new Map();

  const rows = await DB.query<{ recipeId: string; lastCookedOn: string }>(
    `SELECT recipe_id as "recipeId", to_char(MAX(cooked_on), 'YYYY-MM-DD') as "lastCookedOn"
     FROM cooks
     WHERE recipe_id = ANY($1::uuid[]) AND is_leftovers = FALSE
     GROUP BY recipe_id`,
    [recipeIds]
  );

  return new Map(rows.map((row) => [row.recipeId, row.lastCookedOn]));
}

export async function deleteCook(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const result = await DB.query(
    `DELETE FROM cooks WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.length > 0;
}
