-- migrate:up
CREATE TABLE cooked_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_meal_id UUID UNIQUE REFERENCES planned_meals(id) ON DELETE SET NULL,
  cooked_on DATE NOT NULL,
  meal_slot meal_slot NOT NULL,
  headcount INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooked_meals_headcount_positive CHECK (headcount > 0)
);

CREATE INDEX idx_cooked_meals_cooked_on ON cooked_meals(cooked_on DESC);

CREATE TABLE cooked_meal_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooked_meal_id UUID NOT NULL REFERENCES cooked_meals(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  label VARCHAR(255) NOT NULL,
  is_leftovers BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT cooked_meal_dishes_label_not_blank CHECK (btrim(label) <> '')
);

CREATE INDEX idx_cooked_meal_dishes_cooked_meal_id ON cooked_meal_dishes(cooked_meal_id);
CREATE INDEX idx_cooked_meal_dishes_recipe_id ON cooked_meal_dishes(recipe_id);

-- migrate:down
DROP TABLE cooked_meal_dishes;
DROP TABLE cooked_meals;
