-- migrate:up
-- LOWERCASE BECOMES THE CANONICAL FORM OF ingredients.name.
--
-- The write path used to capitalize ("chicken thighs" -> "Chicken thighs")
-- while the 218 seeded rows are lowercase ("allspice"). ON CONFLICT (name)
-- therefore never matched a seeded row, so every recipe saved through the UI
-- or the API forked a capitalized twin: the seeded vocabulary was unreachable,
-- and the shared `ingredients` table -- which grocery aggregation and
-- inventory will both read -- filled with near-duplicate pairs that no query
-- can tell apart.
--
-- Lowercase wins rather than capitalized, for consistency with the seeds and
-- with `units`, whose resolveUnitId already canonicalizes to lowercase.
-- Capitalization is a display concern and now lives in the presentation layer
-- (app/features/recipes/lib/display-name.ts).

-- 1. Merge the duplicates BEFORE folding the names, or the fold trips the
--    existing UNIQUE(name) constraint.
--
--    The survivor of each lower(name) group is chosen deterministically:
--    an already-canonical (lowercase) row first -- that is the seeded row we
--    want everything to collapse onto -- then the oldest, then by id so the
--    choice is total even when created_at ties.
--    A temp table rather than ON COMMIT DROP, so this migration behaves the
--    same whether or not it is wrapped in a transaction.
CREATE TEMPORARY TABLE ingredient_merges AS
SELECT
  i.id AS duplicate_id,
  first_value(i.id) OVER (
    PARTITION BY lower(btrim(i.name))
    ORDER BY (i.name = lower(btrim(i.name))) DESC, i.created_at, i.id
  ) AS survivor_id
FROM ingredients i;

DELETE FROM ingredient_merges WHERE duplicate_id = survivor_id;

-- 2. Repoint the children first. recipe_ingredients.ingredient_id is
--    ON DELETE RESTRICT, so a row left pointing at a duplicate would abort
--    step 3 rather than be silently dropped -- but repointing is what we want
--    regardless: no recipe_ingredients row is deleted by this migration, and
--    none is orphaned.
--
--    UNIQUE(recipe_id, ingredient_id) was dropped in 20260919143012, so a
--    recipe that listed both "Flour" and "flour" keeps BOTH lines, now both
--    pointing at the surviving ingredient. That is the same shape as the
--    "2 cups flour, divided" + "1 tbsp for dusting" case that constraint was
--    dropped to allow.
UPDATE recipe_ingredients ri
SET ingredient_id = m.survivor_id
FROM ingredient_merges m
WHERE ri.ingredient_id = m.duplicate_id;

-- 3. The duplicates are now unreferenced.
DELETE FROM ingredients i
USING ingredient_merges m
WHERE i.id = m.duplicate_id;

DROP TABLE ingredient_merges;

-- 4. Fold what is left. Only the survivors remain, so this cannot collide.
UPDATE ingredients
SET name = lower(btrim(name))
WHERE name <> lower(btrim(name));

-- 5. Keep it canonical from here on.
--
--    A CHECK, not a UNIQUE index on lower(name). A functional unique index
--    would only reject a capitalized name that HAPPENS to collide with an
--    existing lowercase row -- "Zebra fruit" would still be stored as-is when
--    no "zebra fruit" exists yet, which is precisely how the vocabulary
--    fragments. It is also redundant: with this CHECK in force every stored
--    name already equals lower(name), so the existing UNIQUE(name) IS the
--    unique index on lower(name), and a second one would cost writes and disk
--    to enforce nothing extra. The CHECK states the actual invariant, fails
--    loudly at the moment of the bad write, and makes the write path's
--    .trim().toLowerCase() a belt-and-braces measure rather than the only
--    thing standing between the table and another fork.
ALTER TABLE ingredients
  ADD CONSTRAINT ingredients_name_is_canonical
  CHECK (name = lower(btrim(name)));

-- migrate:down
-- Dropping the constraint is the whole rollback. The merges and the fold are
-- deliberately NOT reversed: the capitalized twins were duplicates of rows
-- that already existed, so there is nothing to restore that the survivor does
-- not already say, and re-splitting them would only re-create the bug. Names
-- entered before this ran are readable in either form.
ALTER TABLE ingredients
  DROP CONSTRAINT ingredients_name_is_canonical;
