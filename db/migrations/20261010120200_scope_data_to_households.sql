-- migrate:up
ALTER TABLE ingredients ADD COLUMN is_standard BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE units ADD COLUMN is_standard BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE recipes ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE recipe_tags ADD COLUMN household_id UUID;
ALTER TABLE planned_meals ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE planned_meal_dishes ADD COLUMN household_id UUID;
ALTER TABLE cooked_meals ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE cooked_meal_dishes ADD COLUMN household_id UUID;

DO $$
DECLARE
  home UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM recipes)
    OR EXISTS (SELECT 1 FROM tags)
    OR EXISTS (SELECT 1 FROM planned_meals)
    OR EXISTS (SELECT 1 FROM cooked_meals)
  THEN
    INSERT INTO households (name) VALUES ('Home') RETURNING id INTO home;
    UPDATE recipes SET household_id = home;
    UPDATE tags SET household_id = home;
    UPDATE recipe_tags SET household_id = home;
    UPDATE planned_meals SET household_id = home;
    UPDATE planned_meal_dishes SET household_id = home;
    UPDATE cooked_meals SET household_id = home;
    UPDATE cooked_meal_dishes SET household_id = home;
  END IF;
END $$;

ALTER TABLE recipes
  ALTER COLUMN household_id SET NOT NULL,
  ADD CONSTRAINT recipes_household_id_id_key UNIQUE (household_id, id);

ALTER TABLE tags
  ALTER COLUMN household_id SET NOT NULL,
  DROP CONSTRAINT tags_name_key,
  ADD CONSTRAINT tags_household_id_name_key UNIQUE (household_id, name),
  ADD CONSTRAINT tags_household_id_id_key UNIQUE (household_id, id);

ALTER TABLE recipe_tags
  ALTER COLUMN household_id SET NOT NULL,
  DROP CONSTRAINT recipe_tags_recipe_id_fkey,
  DROP CONSTRAINT recipe_tags_tag_id_fkey,
  ADD CONSTRAINT recipe_tags_recipe_in_household
    FOREIGN KEY (household_id, recipe_id) REFERENCES recipes(household_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT recipe_tags_tag_in_household
    FOREIGN KEY (household_id, tag_id) REFERENCES tags(household_id, id) ON DELETE CASCADE;

ALTER TABLE planned_meals
  ALTER COLUMN household_id SET NOT NULL,
  DROP CONSTRAINT planned_meals_one_per_slot,
  ADD CONSTRAINT planned_meals_one_per_slot UNIQUE (household_id, planned_on, meal_slot),
  ADD CONSTRAINT planned_meals_household_id_id_key UNIQUE (household_id, id);

ALTER TABLE planned_meal_dishes
  ALTER COLUMN household_id SET NOT NULL,
  DROP CONSTRAINT planned_meal_dishes_planned_meal_id_fkey,
  DROP CONSTRAINT planned_meal_dishes_recipe_id_fkey,
  ADD CONSTRAINT planned_meal_dishes_meal_in_household
    FOREIGN KEY (household_id, planned_meal_id) REFERENCES planned_meals(household_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT planned_meal_dishes_recipe_in_household
    FOREIGN KEY (household_id, recipe_id) REFERENCES recipes(household_id, id) ON DELETE CASCADE;

ALTER TABLE cooked_meals
  ALTER COLUMN household_id SET NOT NULL,
  DROP CONSTRAINT cooked_meals_planned_meal_id_fkey,
  ADD CONSTRAINT cooked_meals_household_id_id_key UNIQUE (household_id, id),
  ADD CONSTRAINT cooked_meals_plan_in_household
    FOREIGN KEY (household_id, planned_meal_id) REFERENCES planned_meals(household_id, id)
    ON DELETE SET NULL (planned_meal_id);

DROP INDEX idx_cooked_meals_cooked_on;
CREATE INDEX idx_cooked_meals_household_id_cooked_on ON cooked_meals(household_id, cooked_on DESC);

ALTER TABLE cooked_meal_dishes
  ALTER COLUMN household_id SET NOT NULL,
  DROP CONSTRAINT cooked_meal_dishes_cooked_meal_id_fkey,
  DROP CONSTRAINT cooked_meal_dishes_recipe_id_fkey,
  ADD CONSTRAINT cooked_meal_dishes_meal_in_household
    FOREIGN KEY (household_id, cooked_meal_id) REFERENCES cooked_meals(household_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT cooked_meal_dishes_recipe_in_household
    FOREIGN KEY (household_id, recipe_id) REFERENCES recipes(household_id, id) ON DELETE SET NULL (recipe_id);

-- migrate:down
ALTER TABLE cooked_meal_dishes
  DROP CONSTRAINT cooked_meal_dishes_meal_in_household,
  DROP CONSTRAINT cooked_meal_dishes_recipe_in_household,
  DROP COLUMN household_id;

ALTER TABLE cooked_meals
  DROP CONSTRAINT cooked_meals_plan_in_household,
  DROP CONSTRAINT cooked_meals_household_id_id_key,
  DROP COLUMN household_id;

CREATE INDEX idx_cooked_meals_cooked_on ON cooked_meals(cooked_on DESC);

ALTER TABLE planned_meal_dishes
  DROP CONSTRAINT planned_meal_dishes_meal_in_household,
  DROP CONSTRAINT planned_meal_dishes_recipe_in_household,
  DROP COLUMN household_id;

ALTER TABLE planned_meals
  DROP CONSTRAINT planned_meals_household_id_id_key,
  DROP CONSTRAINT planned_meals_one_per_slot,
  DROP COLUMN household_id,
  ADD CONSTRAINT planned_meals_one_per_slot UNIQUE (planned_on, meal_slot);

ALTER TABLE recipe_tags
  DROP CONSTRAINT recipe_tags_recipe_in_household,
  DROP CONSTRAINT recipe_tags_tag_in_household,
  DROP COLUMN household_id;

UPDATE recipe_tags rt
SET tag_id = keep.id
FROM tags t
JOIN (SELECT DISTINCT ON (name) name, id FROM tags ORDER BY name, created_at, id) keep ON keep.name = t.name
WHERE rt.tag_id = t.id AND t.id <> keep.id;

DELETE FROM tags t
USING (SELECT DISTINCT ON (name) name, id FROM tags ORDER BY name, created_at, id) keep
WHERE t.name = keep.name AND t.id <> keep.id;

ALTER TABLE tags
  DROP CONSTRAINT tags_household_id_id_key,
  DROP CONSTRAINT tags_household_id_name_key,
  DROP COLUMN household_id,
  ADD CONSTRAINT tags_name_key UNIQUE (name);

ALTER TABLE recipes
  DROP CONSTRAINT recipes_household_id_id_key,
  DROP COLUMN household_id;

ALTER TABLE recipe_tags
  ADD CONSTRAINT recipe_tags_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  ADD CONSTRAINT recipe_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE planned_meal_dishes
  ADD CONSTRAINT planned_meal_dishes_planned_meal_id_fkey
    FOREIGN KEY (planned_meal_id) REFERENCES planned_meals(id) ON DELETE CASCADE,
  ADD CONSTRAINT planned_meal_dishes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;

ALTER TABLE cooked_meals
  ADD CONSTRAINT cooked_meals_planned_meal_id_fkey
    FOREIGN KEY (planned_meal_id) REFERENCES planned_meals(id) ON DELETE SET NULL;

ALTER TABLE cooked_meal_dishes
  ADD CONSTRAINT cooked_meal_dishes_cooked_meal_id_fkey
    FOREIGN KEY (cooked_meal_id) REFERENCES cooked_meals(id) ON DELETE CASCADE,
  ADD CONSTRAINT cooked_meal_dishes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;

ALTER TABLE units DROP COLUMN is_standard;
ALTER TABLE ingredients DROP COLUMN is_standard;
