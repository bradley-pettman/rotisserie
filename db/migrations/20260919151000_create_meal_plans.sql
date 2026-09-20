-- migrate:up
-- A meal plan is an INTENTION: what we mean to eat, over a date range. It is
-- mutable and may never happen. Moving Tuesday's tacos to Wednesday is an
-- ordinary edit here, not a rewrite of history -- history lives in `cooks`.
CREATE TABLE meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unnamed plans are normal: "the week of the 21st" needs no title.
  name VARCHAR(255),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A single-day plan is legal, so this is >= and not >.
  CONSTRAINT meal_plans_date_range_check CHECK (ends_on >= starts_on)
);

CREATE TABLE meal_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  -- recipe_id is nullable BY DESIGN, and that is the whole point of this
  -- column's shape. "pizza night" names no recipe, and a plan built entirely
  -- out of free text is a perfectly valid plan -- which is exactly what lets
  -- the planner run with the recipe book empty, or absent. The planner never
  -- joins to `recipes`: it carries this raw UUID and leaves resolving it to a
  -- name to the caller, so this foreign key buys referential integrity only,
  -- not a module dependency.
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  custom_text VARCHAR(255),
  planned_on DATE NOT NULL,
  meal_slot VARCHAR(20) NOT NULL DEFAULT 'dinner',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  -- Same four slots as cooks.meal_slot, so a cook can be matched to the plan
  -- item it fulfils without translating between vocabularies.
  CONSTRAINT meal_plan_items_meal_slot_check
    CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  -- A plan item must name SOMETHING: a recipe, free text, or both (a recipe
  -- plus "double it, half for the freezer"). Neither is meaningless, so it is
  -- rejected here rather than rendering as a blank row in the week view.
  CONSTRAINT meal_plan_items_names_something_check
    CHECK (recipe_id IS NOT NULL OR custom_text IS NOT NULL)
);

CREATE INDEX idx_meal_plan_items_meal_plan_id ON meal_plan_items(meal_plan_id);
CREATE INDEX idx_meal_plan_items_planned_on ON meal_plan_items(planned_on);
CREATE INDEX idx_meal_plan_items_recipe_id ON meal_plan_items(recipe_id);

-- migrate:down
DROP TABLE meal_plan_items;
DROP TABLE meal_plans;
