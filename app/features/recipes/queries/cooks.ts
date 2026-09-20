import { DB } from "~/db/connection";
import type { QueryFns, QueryParam } from "~/db/connection";
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

/**
 * A stored cook, plus whether THIS call is what stored it.
 *
 * `created: false` means the client named an id that was already in the table:
 * this call wrote nothing and the row handed back is the one written earlier.
 * The API turns that into a 200 rather than a 201, which is the only signal a
 * caller gets that its first attempt did in fact land.
 */
export interface LoggedCook {
  cook: Cook;
  created: boolean;
}

/**
 * Read one cook back by id. Module-private and only ever handed an id that
 * `createCookSchema` has already validated as a UUID, so it needs no `isUuid`
 * guard of the kind `lastCookedAt` and `deleteCook` carry for ids arriving
 * raw from a route.
 */
async function selectCookById(db: QueryFns, id: string): Promise<Cook | null> {
  return db.queryOne<Cook>(
    `SELECT ${COOK_COLUMNS} FROM cooks WHERE id = $1`,
    [id]
  );
}

async function insertCook(
  db: QueryFns,
  input: CreateCookInput,
  label: string
): Promise<LoggedCook> {
  const columns: QueryParam[] = [
    input.recipeId,
    label,
    input.cookedOn,
    input.mealSlot,
    input.servingsMade,
    input.notes,
    input.isLeftovers,
  ];

  // No client id: the server generates one, which cannot collide with
  // anything, so this stays the single unconditional INSERT it has always
  // been. Writing ON CONFLICT DO NOTHING here anyway would claim a
  // possibility that does not exist on this branch -- and folding the two
  // statements into one by passing a NULL id does not work: an explicit NULL
  // OVERRIDES a column DEFAULT rather than triggering it, so it would fail
  // the primary key's NOT NULL instead of generating a uuid.
  if (!input.id) {
    const cook = await db.queryOne<Cook>(
      `INSERT INTO cooks (recipe_id, label, cooked_on, meal_slot, servings_made, notes, is_leftovers)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COOK_COLUMNS}`,
      columns
    );

    if (!cook) throw new Error("Failed to log cook");

    return { cook, created: true };
  }

  const inserted = await db.queryOne<Cook>(
    `INSERT INTO cooks (id, recipe_id, label, cooked_on, meal_slot, servings_made, notes, is_leftovers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${COOK_COLUMNS}`,
    [input.id, ...columns]
  );

  if (inserted) return { cook: inserted, created: true };

  // THE TRAP, and the reason this is two statements: DO NOTHING suppresses
  // the RETURNING clause along with the insert, so a conflict comes back as
  // ZERO ROWS -- byte for byte what a failed insert looks like. Treating that
  // as an error is precisely the bug idempotency exists to kill: the retry
  // would answer 500, the client would queue yet another attempt, and the
  // cook it is anxious about is sitting in the table the whole time. Read it
  // back and answer with it.
  //
  // A SECOND statement is safe HERE in a way it would not be on a mutable
  // table: `cooks` is append-only and this module exposes no UPDATE, so a
  // row's columns never change after it is written. The only thing that can
  // happen to it between the two statements is a DELETE.
  const stored = await selectCookById(db, input.id);

  // Nothing inserted and nothing there: either the row was deleted between the
  // two statements, or a concurrent transaction is inserting this same id and
  // has not committed (DO NOTHING does not wait for it, so its row is not in
  // our snapshot). Both are honestly "cannot answer yet" rather than any row
  // we could invent, so this throws and `apiRoute` answers 500 -- which a
  // retrying client treats as "try again", and the next attempt converges once
  // the other transaction has committed.
  if (!stored) throw new Error("Failed to log cook");

  // WE DELIBERATELY DO NOT COMPARE the stored row against this request. A
  // reused id carrying a different body is a client bug, and the choice is
  // between replaying what is stored and answering 409. Replay wins because
  // the likelier cause of a mismatch is benign -- an offline queue that
  // re-derives `cookedOn` from "today" at flush time and crosses midnight, a
  // label the server snapshotted itself -- and a 409 there strands the queue
  // on a write that already succeeded, which is the exact failure this whole
  // branch exists to prevent. The tradeoff is real and worth saying out loud:
  // a client that genuinely reuses one id for two different meals loses the
  // second, silently, recorded as the first. The 200-vs-201 split is what
  // makes that bug observable rather than invisible. Overwriting the stored
  // row is never an option -- that is a PATCH on append-only history, which
  // this module offers to no one.
  return { cook: stored, created: false };
}

/**
 * Log a cook, saying whether it was written now or had already been written.
 * Returns `null` when the cook names a recipe that does not exist.
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
 *
 * The `created` flag rides all the way out to the HTTP layer because only the
 * INSERT knows the answer: by the time the row is in hand both outcomes look
 * identical. See `createCookSchema.id` for why a caller would want to know.
 */
export async function logCookWithOutcome(
  input: CreateCookInput,
  tx?: QueryFns
): Promise<LoggedCook | null> {
  const label = input.label.trim();

  // A label was supplied, so there is nothing to look up: one insert, no
  // transaction needed. (Idempotent replay may cost a second statement inside
  // `insertCook`, but it reads a row that can no longer change, so it needs no
  // transaction either -- see the note there.)
  if (label) return insertCook(tx ?? DB, input, label);

  if (!input.recipeId) {
    throw new Error("A cook needs either a label or a recipeId to snapshot a label from");
  }

  // Blank label against a real recipe: snapshot the recipe's current name.
  // The lookup and the insert share a transaction so a concurrent rename
  // cannot land between them and store a name that never existed together
  // with this cook.
  const snapshot = async (db: QueryFns): Promise<LoggedCook | null> => {
    const recipe = await db.queryOne<{ name: string }>(
      `SELECT name FROM recipes WHERE id = $1`,
      [input.recipeId]
    );

    if (recipe) return insertCook(db, input, recipe.name);

    // No recipe to snapshot from -- but if the caller named an id that is
    // already stored, this is a REPLAY, and a replay outlives the recipe it
    // came from. That is the whole point of `cooks.recipe_id` being ON DELETE
    // SET NULL beside a snapshot label: deleting a recipe does not un-cook
    // it. Answering 404 here would tell a retrying client its write never
    // landed, about a row sitting in the table, and leave it retrying a
    // request that can now never succeed. The lookup costs one query on a
    // path that was already returning an error, so it is free on every happy
    // path.
    const stored = input.id ? await selectCookById(db, input.id) : null;

    return stored ? { cook: stored, created: false } : null;
  };

  return tx ? snapshot(tx) : DB.withTransaction(snapshot);
}

/**
 * `logCookWithOutcome` for callers that only want the row.
 *
 * It exists so the HTML routes and the integration layer -- which redirect on
 * success and have no status code to vary -- are not made to destructure an
 * answer they do not use. Same query, same transaction semantics, same `null`
 * for a missing recipe; only the created/replayed distinction is dropped.
 */
export async function logCook(
  input: CreateCookInput,
  tx?: QueryFns
): Promise<Cook | null> {
  return (await logCookWithOutcome(input, tx))?.cook ?? null;
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
