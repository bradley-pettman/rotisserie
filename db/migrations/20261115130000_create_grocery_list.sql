-- migrate:up
CREATE TABLE grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  line JSONB,
  checked_at TIMESTAMPTZ,
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grocery_items_text_not_blank CHECK (btrim(text) <> '')
);

CREATE INDEX idx_grocery_items_household_sort ON grocery_items(household_id, sort_order);

CREATE TABLE grocery_list_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  planned_meal_id UUID,
  label VARCHAR(255) NOT NULL,
  lines JSONB NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grocery_list_meals_one_per_plan UNIQUE (household_id, planned_meal_id),
  CONSTRAINT grocery_list_meals_plan_in_household
    FOREIGN KEY (household_id, planned_meal_id) REFERENCES planned_meals(household_id, id)
    ON DELETE SET NULL (planned_meal_id)
);

-- migrate:down
DROP TABLE grocery_list_meals;
DROP TABLE grocery_items;
