-- migrate:up
-- recipe_ingredients.unit was free text sitting next to a fully populated
-- units lookup table that nothing referenced. Collapse the two sources of
-- truth onto units(id).
ALTER TABLE recipe_ingredients
  ADD COLUMN unit_id UUID REFERENCES units(id) ON DELETE RESTRICT;

-- Match the existing free text against units, case-insensitively and ignoring
-- surrounding whitespace, on either name or abbreviation. abbreviation is
-- nullable, so guard it. DISTINCT ON keeps one unit per row and prefers a
-- name match over an abbreviation match when both hit.
UPDATE recipe_ingredients ri
SET unit_id = matched.unit_id
FROM (
  SELECT DISTINCT ON (src.id)
    src.id AS recipe_ingredient_id,
    u.id   AS unit_id
  FROM recipe_ingredients src
  JOIN units u
    ON lower(btrim(src.unit)) = lower(btrim(u.name))
    OR (u.abbreviation IS NOT NULL AND lower(btrim(src.unit)) = lower(btrim(u.abbreviation)))
  WHERE src.unit IS NOT NULL
    AND btrim(src.unit) <> ''
  ORDER BY src.id, (lower(btrim(src.unit)) = lower(btrim(u.name))) DESC, u.name
) matched
WHERE ri.id = matched.recipe_ingredient_id;

-- Anything non-empty that still matched nothing becomes a real units row,
-- flagged category = 'unreviewed' so these can be merged or renamed by hand
-- later. They are deliberately kept, not discarded.
INSERT INTO units (name, abbreviation, category)
SELECT DISTINCT
  lower(btrim(ri.unit)),
  NULL::VARCHAR(10),
  'unreviewed'::VARCHAR(50)
FROM recipe_ingredients ri
WHERE ri.unit_id IS NULL
  AND ri.unit IS NOT NULL
  AND btrim(ri.unit) <> ''
ON CONFLICT (name) DO NOTHING;

-- Link the rows that just got a unit created for them. units.name is UNIQUE
-- and was inserted as lower(btrim(unit)), so this match is exact.
UPDATE recipe_ingredients ri
SET unit_id = u.id
FROM units u
WHERE ri.unit_id IS NULL
  AND ri.unit IS NOT NULL
  AND btrim(ri.unit) <> ''
  AND lower(btrim(ri.unit)) = u.name;

-- Rows whose unit was NULL or blank keep unit_id NULL -- "3 eggs" has no unit.
ALTER TABLE recipe_ingredients DROP COLUMN unit;

CREATE INDEX idx_recipe_ingredients_unit_id ON recipe_ingredients(unit_id);

-- migrate:down
-- NOTE: this is lossy. The restored text is the canonical units.name, so a row
-- originally entered as 'tbsp' or '  Cups ' comes back as 'tablespoon' or
-- 'cup'. Units created by the up migration survive in the units table.
ALTER TABLE recipe_ingredients ADD COLUMN unit VARCHAR(50);

UPDATE recipe_ingredients ri
SET unit = u.name
FROM units u
WHERE ri.unit_id = u.id;

DROP INDEX idx_recipe_ingredients_unit_id;

ALTER TABLE recipe_ingredients DROP COLUMN unit_id;
