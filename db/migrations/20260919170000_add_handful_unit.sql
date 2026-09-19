-- migrate:up
-- `handful` becomes a recognized unit, so that "A handful of fresh parsley"
-- parses as {unit: handful, name: "fresh parsley"} instead of keeping its
-- leading words in the ingredient name.
--
-- The seed file gains the same row, but seeds only run on a fresh install.
-- Without this migration an existing database would have no `handful` row,
-- and resolveUnitId would create one with category = 'unreviewed' the first
-- time a recipe used it -- the invariant that every canonical name in
-- UNIT_MAPPINGS already has a seeded row is what keeps those junk rows out.
--
-- 'count', alongside pinch and dash: an approximate count, not a volume or a
-- weight. No abbreviation, as those three have none.
--
-- ON CONFLICT (name) DO NOTHING mirrors the seed, so running this against a
-- database that was seeded from the updated file is a no-op rather than a
-- unique violation.
INSERT INTO units (name, abbreviation, category) VALUES
  ('handful', NULL, 'count')
ON CONFLICT (name) DO NOTHING;

-- migrate:down
-- Only when nothing points at it. recipe_ingredients.unit_id is ON DELETE
-- RESTRICT, so a referenced row would abort the rollback; leaving it in place
-- costs nothing, while losing the link from a saved recipe would not.
DELETE FROM units u
WHERE u.name = 'handful'
  AND NOT EXISTS (
    SELECT 1 FROM recipe_ingredients ri WHERE ri.unit_id = u.id
  );
