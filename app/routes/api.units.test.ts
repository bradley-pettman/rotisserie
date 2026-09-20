/**
 * The invariant /api/units' `aliases` field rests on, pinned.
 *
 * This file tests a relationship between two things that have no import
 * between them: the fold table in `parse-ingredient.ts` and the seeded rows in
 * `db/seeds/units.sql`. Nothing in the type system or the schema connects
 * them, so the only thing keeping them in step has been that whoever edited
 * one remembered the other.
 *
 * The codebase already depends on that agreement and already says so --
 * migration 20260919170000 adds `handful` to the table AND to the seed, and
 * explains why: "the invariant that every canonical name in UNIT_MAPPINGS
 * already has a seeded row is what keeps those junk rows out." A canonical
 * name with no seeded row means `resolveUnitId` folds a spelling onto a name
 * that does not exist yet and mints it with category 'unreviewed' -- the
 * review queue filling up with units that were supposed to be known.
 *
 * GET /api/units now leans on the same agreement from the other side. It hangs
 * each unit's aliases off its seeded row and documents an empty array as
 * meaning "this row arrived by being typed". Both halves of that claim are
 * assertions about these two sets being equal:
 *
 *   a canonical name with no seeded row -> its aliases vanish from the
 *     response with no row to hang off, and the client never learns that
 *     spelling would have folded
 *   a seeded row with no canonical name -> it reports an empty `aliases` and
 *     reads as unreviewed when it is nothing of the kind
 *
 * Neither failure is loud. Both are a silently wrong API response, which is
 * why they are worth a test rather than a comment.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { UNIT_MAPPINGS } from "~/features/recipes/lib/parse-ingredient";

/**
 * The seed is read as TEXT rather than executed, because there is no database
 * in the unit suite. That makes this a test of the file, not of a live
 * `units` table -- it catches the edit that forgets its counterpart, which is
 * the actual failure mode, and it cannot catch a database that was never
 * seeded or has drifted since.
 */
function seededUnitNames(): Set<string> {
  const sql = readFileSync(
    fileURLToPath(new URL("../../db/seeds/units.sql", import.meta.url)),
    "utf8"
  );

  // Every row in the seed is a `('name', 'abbr', 'category'),` tuple at the
  // start of a line. The name is the first quoted field.
  return new Set([...sql.matchAll(/^\s*\('([^']+)'/gm)].map((match) => match[1]));
}

describe("the unit vocabulary and the fold table agree", () => {
  const seeded = seededUnitNames();
  const canonical = new Set(Object.values(UNIT_MAPPINGS));

  it("reads the seed it is asserting about", () => {
    // A regex that silently matched nothing would make every assertion below
    // vacuously true, which is the one way this file could fail to do its job.
    expect(seeded.size).toBeGreaterThan(20);
  });

  it("folds every spelling onto a name that is actually seeded", () => {
    const unseeded = [...canonical].filter((name) => !seeded.has(name));

    expect(unseeded, "canonical names in UNIT_MAPPINGS with no row in db/seeds/units.sql").toEqual(
      []
    );
  });

  it("gives every seeded unit at least one spelling to fold", () => {
    const aliasless = [...seeded].filter((name) => !canonical.has(name));

    expect(
      aliasless,
      "seeded units no UNIT_MAPPINGS entry folds onto -- these would report " +
        "aliases: [] and read as 'unreviewed' in GET /api/units"
    ).toEqual([]);
  });
});
