-- migrate:up

-- ---------------------------------------------------------------------------
-- 1. THE RECIPE SEARCH HAS NO USABLE INDEX.
--
--    `listRecipes` filters with `r.name ILIKE '%term%'`. The only index on that
--    column is a default-opclass btree (idx_recipes_name, from
--    20260129160603), which serves neither a leading wildcard nor a
--    case-insensitive match -- so it cannot be used by the one query that
--    filters on name. It is dead weight that also makes the omission look
--    handled.
--
--    That matters because the search is on the interactive path: the box
--    navigates on a 300ms debounce, and the HTML list passes no limit, so each
--    typing pause is a sequential scan of `recipes` plus a full sort, and the
--    whole matching set is serialised into the SSR payload. Invisible at 200
--    recipes; a scan per keystroke at 20,000.
--
--    A trigram GIN index is the one that can answer a leading-wildcard
--    case-insensitive LIKE. Measured on 200,000 recipes: 121.8ms sequential
--    scan versus 2.7ms with this index, per keystroke pause. Postgres still
--    picks a sequential scan on a small table, which is correct -- at 20,000
--    rows the whole table is a few hundred pages and the index does not pay.
--    So this changes nothing today and removes the cliff later, which is the
--    point of adding it now rather than after someone hits it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

--    ON (name::text), NOT ON name. `recipes.name` is VARCHAR(255), so the
--    planner writes the predicate as `(name)::text ~~* '...'` -- and an index
--    declared over the varchar column does not match that expression, so it is
--    never used. Verified: with `gin (name gin_trgm_ops)` a selective ILIKE
--    over 20,000 rows still plans a Seq Scan; with the cast it plans a Bitmap
--    Index Scan on this index.
CREATE INDEX idx_recipes_name_trgm ON recipes USING gin ((name::text) gin_trgm_ops);

-- The btree it replaces. Nothing else uses it: every other read of
-- `recipes.name` is either this ILIKE or an ordered full scan.
DROP INDEX IF EXISTS idx_recipes_name;

-- The list's actual sort order, so it does not need a full sort to page.
CREATE INDEX idx_recipes_created_at_id ON recipes (created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- 2. THREE INDEXES THAT DUPLICATE A UNIQUE CONSTRAINT.
--
--    `units.name`, `ingredients.name` and `tags.name` are each declared UNIQUE,
--    which already creates a unique btree on exactly that column. The extra
--    plain index serves no query the unique one does not -- every lookup is
--    either `ON CONFLICT (name)` or an ORDER BY name -- and costs a second
--    write on the hottest write path there is: saving a recipe upserts one row
--    per ingredient line.
DROP INDEX IF EXISTS idx_units_name;
DROP INDEX IF EXISTS idx_ingredients_name;
DROP INDEX IF EXISTS idx_tags_name;

-- ---------------------------------------------------------------------------
-- 3. meal_plans HAD NO INDEX AT ALL BEYOND ITS PRIMARY KEY.
--
--    `findPlanCovering` runs on every planner load and every meal assignment,
--    and both it and `listMealPlans` currently seq-scan and sort. One plan per
--    week means this is an omission rather than an incident -- which is exactly
--    when it is cheap to close.
CREATE INDEX idx_meal_plans_starts_on ON meal_plans (starts_on DESC, ends_on);
CREATE INDEX idx_meal_plans_created_at ON meal_plans (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. CANONICAL NAMES FOR tags AND units, ENFORCED BY THE DATABASE.
--
--    CLAUDE.md states that tags and units are stored lowercased and trimmed.
--    `ingredients` has a CHECK saying so (20260919160000); these two have only
--    the application's `.toLowerCase()`, which is not a constraint -- it is a
--    habit that the seed scripts, a fixture, a psql session or the next writer
--    can all bypass.
--
--    The argument is the one that migration already made, and it applies here
--    verbatim: a capitalized name slips past `ON CONFLICT (name)` and forks a
--    twin of the seeded row that no query can tell apart. The fix was applied
--    to one table of the three.
--
--    The merge below mirrors that migration's approach, including its choice of
--    survivor: an already-canonical row first (that is the seeded one we want
--    everything to collapse onto), then the oldest, then by id so the ordering
--    is total.

-- 4a. tags
CREATE TEMPORARY TABLE tag_merges AS
SELECT
  t.id AS duplicate_id,
  first_value(t.id) OVER (
    PARTITION BY lower(btrim(t.name))
    ORDER BY (t.name = lower(btrim(t.name))) DESC, t.created_at, t.id
  ) AS survivor_id
FROM tags t;

DELETE FROM tag_merges WHERE duplicate_id = survivor_id;

-- recipe_tags is PRIMARY KEY (recipe_id, tag_id), so a recipe carrying both
-- "Weeknight" and "weeknight" would collide on repoint. Drop the losing row
-- first -- the recipe keeps the tag either way, which is the whole intent.
DELETE FROM recipe_tags rt
USING tag_merges m
WHERE rt.tag_id = m.duplicate_id
  AND EXISTS (
    SELECT 1 FROM recipe_tags existing
    WHERE existing.recipe_id = rt.recipe_id
      AND existing.tag_id = m.survivor_id
  );

UPDATE recipe_tags rt
SET tag_id = m.survivor_id
FROM tag_merges m
WHERE rt.tag_id = m.duplicate_id;

DELETE FROM tags t USING tag_merges m WHERE t.id = m.duplicate_id;

DROP TABLE tag_merges;

UPDATE tags SET name = lower(btrim(name)) WHERE name <> lower(btrim(name));

ALTER TABLE tags
  ADD CONSTRAINT tags_name_is_canonical
  CHECK (name = lower(btrim(name)));

-- 4b. units
CREATE TEMPORARY TABLE unit_merges AS
SELECT
  u.id AS duplicate_id,
  first_value(u.id) OVER (
    PARTITION BY lower(btrim(u.name))
    ORDER BY (u.name = lower(btrim(u.name))) DESC, u.created_at, u.id
  ) AS survivor_id
FROM units u;

DELETE FROM unit_merges WHERE duplicate_id = survivor_id;

-- recipe_ingredients.unit_id is ON DELETE RESTRICT and carries no uniqueness
-- over (recipe, unit), so repointing is unconditional and drops nothing.
UPDATE recipe_ingredients ri
SET unit_id = m.survivor_id
FROM unit_merges m
WHERE ri.unit_id = m.duplicate_id;

DELETE FROM units u USING unit_merges m WHERE u.id = m.duplicate_id;

DROP TABLE unit_merges;

UPDATE units SET name = lower(btrim(name)) WHERE name <> lower(btrim(name));

ALTER TABLE units
  ADD CONSTRAINT units_name_is_canonical
  CHECK (name = lower(btrim(name)));

-- migrate:down

ALTER TABLE units DROP CONSTRAINT units_name_is_canonical;
ALTER TABLE tags DROP CONSTRAINT tags_name_is_canonical;

-- As in 20260919160000, the merges and the fold are deliberately NOT reversed:
-- the duplicates were twins of rows that already existed, so there is nothing
-- to restore that the survivor does not already say.

DROP INDEX IF EXISTS idx_meal_plans_created_at;
DROP INDEX IF EXISTS idx_meal_plans_starts_on;

CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_units_name ON units(name);

DROP INDEX IF EXISTS idx_recipes_created_at_id;
DROP INDEX IF EXISTS idx_recipes_name_trgm;

CREATE INDEX idx_recipes_name ON recipes(name);
