/**
 * Resource route: /api/units  (GET)
 *
 * The unit vocabulary -- and, the part that makes this more than a list, the
 * spellings the server will fold onto each entry.
 *
 * A client offering units needs two different things and only one of them is
 * in the `units` table. The first is what to put in the picker: that is
 * `getAllUnits`, already ordered by category so it groups on screen. The
 * second is what the server will do to what a user types, and that lives in
 * code rather than in the table. `resolveUnitId` lowercases and trims the
 * incoming unit, runs it through `canonicalizeUnit`, and upserts the RESULT:
 * "Cups", "TBSP" and "fl. oz." all land on the seeded `cup`, `tablespoon` and
 * `fluid ounce` rows instead of forking near-duplicates beside them. A
 * spelling the table does not recognize -- "glug" -- falls through unchanged
 * and is inserted with `category: 'unreviewed'`.
 *
 * A client that cannot see that rule cannot tell those two outcomes apart
 * before it posts. It cannot explain why the unit it sent came back spelled
 * differently, and it cannot warn anyone that "glug" is about to add a row to
 * a shared vocabulary rather than match one. So every entry carries `aliases`,
 * inverted from UNIT_MAPPINGS. Shipping the server's own table beats
 * describing it in a doc a client then reimplements: the client that
 * reimplements a server rule is the client that drifts from it, and this is
 * the same instinct that keeps `capitalizeIngredientName` presentation-only
 * rather than letting each caller invent its own fold.
 *
 * `name` is canonical stored form here too -- lowercase and trimmed, the same
 * as /api/ingredients, and capitalized for display by the same helper. Units
 * have no CHECK constraint behind that (only `ingredients` does), so the fold
 * in `resolveUnitId` is the whole of the enforcement.
 *
 * GET only. Units are created by naming one on a recipe ingredient, exactly as
 * tags and ingredients are; a bare POST could only ever add an unreferenced
 * spelling to a vocabulary whose entire purpose is to be small and shared.
 */
import type { Route } from "./+types/api.units";
import { UNIT_MAPPINGS } from "~/features/recipes/lib/parse-ingredient";
import type { Unit } from "~/features/recipes/queries/recipes";
import { getAllUnits } from "~/features/recipes/queries/recipes";
import {
  apiRoute,
  assertApiAccess,
  jsonCached,
  methodNotAllowedHandler,
} from "~/lib/api";

/** A `units` row plus the spellings that resolve to it. */
export interface UnitVocabularyEntry extends Unit {
  /**
   * Every OTHER spelling `canonicalizeUnit` folds onto `name`.
   *
   * The canonical spelling is `name` itself and is deliberately not repeated
   * here, so a client's lookup table is `name` plus `aliases`. Seeding it with
   * `name` is not busywork to skip: an `unreviewed` row's own spelling is
   * accepted input -- send "glug" again and ON CONFLICT (name) returns the
   * same row -- while nothing in UNIT_MAPPINGS folds onto it.
   *
   * MATCH ON THE LOWERCASED, TRIMMED INPUT. `canonicalizeUnit` normalizes
   * before it looks a spelling up, so a client comparing raw keystrokes
   * against this array misses on "TBSP" and on " tbsp " and concludes, wrongly,
   * that it is about to create a unit.
   *
   * NOT `abbreviation`, and neither one contains the other. `abbreviation` is
   * presentation -- the "tbsp" printed under a quantity -- while `aliases` is
   * the accepted-input set. `whole` has an alias and no abbreviation; a row
   * minted from "glug" has neither.
   *
   * EMPTY IS A SIGNAL, not a gap in the data. UNIT_MAPPINGS' canonical names
   * and the seeded `units` rows are the same 33 names (its own comment commits
   * to that, and they match today), so every seeded unit has at least one
   * alias. An empty array therefore marks precisely the rows that arrived by
   * being typed: the `unreviewed` queue, spelled however whoever typed it
   * spelled it.
   */
  aliases: string[];
}

/**
 * UNIT_MAPPINGS inverted, once, at module load.
 *
 * The table is a static literal of 142 entries with nothing in it read from
 * the database, so rebuilding the index per request would be the most
 * expensive thing this endpoint does -- ahead of the query it exists to serve.
 *
 * `Object.entries` follows insertion order for string keys, so each array
 * comes out in the order the table is written -- the plural, then the
 * abbreviations, the spelled-out singular having been dropped as the identity
 * entry. That is the nicer order to show and, more importantly, a
 * DETERMINISTIC one: the ETag below is a hash of the serialized body, and an
 * index that reordered itself between requests would change the validator
 * without the data changing.
 */
const ALIASES_BY_CANONICAL_NAME = ((): Map<string, string[]> => {
  const index = new Map<string, string[]>();

  for (const [spelling, canonical] of Object.entries(UNIT_MAPPINGS)) {
    // Skip the identity entry ('cup' -> 'cup'); see `aliases` above.
    if (spelling === canonical) continue;

    const spellings = index.get(canonical);
    if (spellings) spellings.push(spelling);
    else index.set(canonical, [spelling]);
  }

  return index;
})();

/**
 * GET /api/units
 *
 * ETagged for the reason set out at length in api.ingredients.ts: a controlled
 * vocabulary that a client re-reads on every editor open and that changes only
 * when someone types a unit nobody has typed before is the best
 * conditional-request candidate in this API. `ORDER BY category, name` is what
 * keeps the validator stable across requests; `name` is UNIQUE, so that is a
 * total order rather than a nearly-total one.
 *
 * The alias table strengthens the case rather than weakening it. It roughly
 * quadruples the size of this response -- 109 spellings hung off 33 rows --
 * and it is the part of the payload that changes least, since it moves only
 * when UNIT_MAPPINGS is edited, by which point a deploy has invalidated
 * everything anyway.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const units = await getAllUnits();

  const vocabulary: UnitVocabularyEntry[] = units.map((unit) => ({
    ...unit,
    aliases: ALIASES_BY_CANONICAL_NAME.get(unit.name) ?? [],
  }));

  return jsonCached(request, vocabulary);
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
