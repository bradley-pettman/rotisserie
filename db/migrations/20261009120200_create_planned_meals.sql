-- migrate:up
CREATE DOMAIN meal_slot AS VARCHAR(20)
  CHECK (VALUE IN ('breakfast', 'lunch', 'dinner', 'snack'));

CREATE TABLE planned_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_on DATE NOT NULL,
  meal_slot meal_slot NOT NULL,
  headcount INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT planned_meals_headcount_positive CHECK (headcount > 0),
  CONSTRAINT planned_meals_one_per_slot UNIQUE (planned_on, meal_slot)
);

CREATE TABLE planned_meal_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_meal_id UUID NOT NULL REFERENCES planned_meals(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  custom_text VARCHAR(255),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT planned_meal_dishes_names_something
    CHECK (recipe_id IS NOT NULL OR custom_text IS NOT NULL),
  CONSTRAINT planned_meal_dishes_custom_text_not_blank
    CHECK (btrim(custom_text) <> '')
);

CREATE INDEX idx_planned_meal_dishes_planned_meal_id ON planned_meal_dishes(planned_meal_id);
CREATE INDEX idx_planned_meal_dishes_recipe_id ON planned_meal_dishes(recipe_id);

-- migrate:down
DROP TABLE planned_meal_dishes;
DROP TABLE planned_meals;
DROP DOMAIN meal_slot;
