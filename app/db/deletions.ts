/**
 * Tombstones: the rows a client's cache has to forget.
 *
 * WHY THIS MODULE LIVES HERE, beside `connection.ts`, and not in a feature
 * module or in `features/integrations/`.
 *
 * The lint rule (eslint.config.js) has nothing to say about the choice: it
 * restricts imports whose SOURCE is a file under `app/features/<module>/`, and
 * the only thing this file imports is `~/db/connection`, which every feature
 * module is explicitly allowed to use. So the placement is a question about
 * meaning rather than one about passing `npm run lint`.
 *
 * NOT a feature module. `deletions` carries rows from `recipes`, `cooks`,
 * `meal_plans` and `meal_plan_items` in one table, and a feature module must
 * work standalone -- the planner answering "which recipes were deleted?" is
 * precisely the coupling the boundary rule exists to prevent, whether or not
 * the SQL happens to mention `recipes`.
 *
 * NOT `features/integrations/` either, which is the interesting one, because
 * "spans two modules" sounds like the integration layer's whole job. It is
 * not: that layer exists for code that JOINS the modules -- `plan-to-cook.ts`
 * links a plan item to the cook that fulfilled it, `plan-with-recipes.ts`
 * resolves a plan's recipeIds to names -- and its defining property is that
 * dropping the integration drops it whole, leaving both modules intact
 * (20260919152000 makes that argument for cook_fulfillments). Nothing here
 * joins anything. This table has no foreign keys, resolves no ids, and would
 * keep working unchanged if either module were deleted tomorrow. Filing it as
 * an integration would also wall it off from the feature modules by lint, for
 * a coupling it does not have.
 *
 * What it actually is: infrastructure belonging to the schema itself. The rows
 * are written by AFTER DELETE triggers rather than by any application code
 * (see 20260920130000 for why that is load-bearing), they describe rows
 * generically as a table name and an id, and reading them is the same kind of
 * question as `checkDatabase` in `connection.ts` -- which sits here on exactly
 * this reasoning: not a recipes question, not a meal-plans question, so
 * neither module is its home. `app/lib/` is the other candidate and is wrong
 * for a different reason: `lib/api.ts` states that it holds no SQL, and this
 * module is nothing but SQL.
 */
import { DB } from "~/db/connection";
import type { QueryParam } from "~/db/connection";

/**
 * The tables covered by an AFTER DELETE trigger, spelled exactly as
 * `TG_TABLE_NAME` writes them.
 *
 * This union is a claim about what the triggers do, which TypeScript cannot
 * check against the database -- so adding a trigger in a migration means
 * adding its table here in the same change. The failure of forgetting is a
 * type that quietly understates the vocabulary, which is why the migration
 * carries no CHECK constraint mirroring this list: a stale type is cheaper to
 * discover than an aborted DELETE.
 */
export type DeletedTable = "recipes" | "cooks" | "meal_plans" | "meal_plan_items";

/**
 * One deleted row. Three fields is the whole of it -- which table, which id,
 * and when -- because the row itself is gone and a tombstone that preserved
 * its contents would be an unreachable copy of data somebody asked to destroy.
 *
 * `deletedAt` is an INSTANT and stays a Date, unlike the calendar days this
 * schema renders to 'YYYY-MM-DD' strings. A deletion happens at a moment in
 * time rather than on a day, and the cursor a client advances through this
 * table has to be comparable to the millisecond, so the usual DATE treatment
 * would be actively wrong here.
 */
export interface Deletion {
  table: DeletedTable;
  id: string;
  deletedAt: Date;
}

export interface ListDeletionsOptions {
  /** Absent means "everything still on file", for a client with no cursor. */
  since?: Date;
  limit: number;
  offset?: number;
}

/**
 * `since` as a WHERE clause, shared by the list and the count.
 *
 * Extracted rather than written twice for the reason `recipeFilterClause`
 * gives at greater length: a count that disagrees with the page it describes
 * is worse than no count at all, and one builder makes that drift impossible
 * rather than merely unlikely. The clause is one condition today; it is shared
 * anyway, because the day it stops being one condition is the day the copy
 * that was not updated starts lying confidently.
 *
 * `>=`, NOT `>`. A client advances its cursor to the newest `deletedAt` it has
 * seen, and every tombstone written by one DELETE shares a timestamp (NOW() is
 * transaction start time, so a recipe and the plan items that cascaded with it
 * are all stamped identically). An exclusive bound would drop the rest of that
 * group the moment a page boundary fell inside it. Inclusive can only ever
 * re-send a tombstone the client already applied, and applying one twice is a
 * no-op -- forgetting a row you have already forgotten costs nothing.
 */
function sinceClause(since?: Date): { where: string; params: QueryParam[] } {
  if (since === undefined) return { where: "", params: [] };

  return { where: "WHERE deleted_at >= $1", params: [since] };
}

/**
 * Tombstones in cursor order: oldest first, so a client can walk them and stop
 * anywhere without losing its place.
 *
 * ASCENDING IS NOT A PREFERENCE. Newest-first plus a limit truncates the OLD
 * end of the range -- the rows a resuming client has not seen -- and leaves it
 * no cursor that reaches them.
 *
 * `offset` is the escape hatch for the one case `since` alone cannot page: a
 * cascade can write more tombstones at a single timestamp than `limit`
 * returns, and a client re-asking with `since = <that timestamp>` would then
 * receive the same first page forever. Paging within a fixed `since` by
 * offset, and only then advancing the cursor, terminates. The usual objection
 * to offset -- that concurrent writes make it skip and duplicate rows -- is at
 * its weakest here: this table is append-mostly and read oldest-first, so new
 * rows land after the window being paged rather than shifting it.
 */
export async function listDeletions({
  since,
  limit,
  offset = 0,
}: ListDeletionsOptions): Promise<Deletion[]> {
  const { where, params } = sinceClause(since);
  const limitIndex = params.length + 1;

  return DB.query<Deletion>(
    `SELECT table_name as "table", row_id as id, deleted_at as "deletedAt"
     FROM deletions
     ${where}
     ORDER BY deleted_at, table_name, row_id
     LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
    [...params, limit, offset]
  );
}

/** How many tombstones match `since` in total, not on the page. */
export async function countDeletions(since?: Date): Promise<number> {
  const { where, params } = sinceClause(since);

  const row = await DB.queryOne<{ total: number }>(
    `SELECT COUNT(*)::int as total FROM deletions ${where}`,
    params
  );

  return row?.total ?? 0;
}
