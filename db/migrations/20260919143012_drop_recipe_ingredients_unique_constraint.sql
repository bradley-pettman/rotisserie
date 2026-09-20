-- migrate:up
-- UNIQUE(recipe_id, ingredient_id) prevents a recipe from listing the same
-- ingredient more than once ("2 cups flour, divided" plus "1 tbsp flour for
-- dusting"). Because recipe ingredients are inserted inside a transaction,
-- tripping it rolls back the whole recipe save.
--
-- Postgres auto-names the constraint recipe_ingredients_recipe_id_ingredient_id_key,
-- but look it up by its columns rather than trusting the name, so this also
-- works on databases where it was created or restored under another name.
DO $$
DECLARE
  target_constraint TEXT;
BEGIN
  SELECT c.conname INTO target_constraint
  FROM pg_constraint c
  WHERE c.conrelid = 'recipe_ingredients'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::TEXT ORDER BY a.attname)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = k.attnum
    ) = ARRAY['ingredient_id', 'recipe_id']
  LIMIT 1;

  IF target_constraint IS NULL THEN
    RAISE NOTICE 'No UNIQUE(recipe_id, ingredient_id) constraint on recipe_ingredients; nothing to drop.';
  ELSE
    EXECUTE format('ALTER TABLE recipe_ingredients DROP CONSTRAINT %I', target_constraint);
  END IF;
END
$$;

-- migrate:down
-- NOTE: this will fail if duplicate (recipe_id, ingredient_id) rows have been
-- created while the constraint was absent -- which is the whole point of
-- dropping it. Deduplicate those rows before rolling back.
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_recipe_id_ingredient_id_key UNIQUE (recipe_id, ingredient_id);
