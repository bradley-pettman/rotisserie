-- migrate:up
-- History: FACT. What we actually ate, recorded after the fact. Append-only
-- in spirit: corrections are fine, but nothing about editing a PLAN may
-- reach in here.
--
-- Why a separate table from planned_meals rather than one `meals` table with
-- planned and cooked attributes: when the plan and reality differ (sloppy
-- joes for 4 planned, meatloaf for 6 eaten), both must survive, and the
-- dishes are a list that cannot be doubled up as columns. The two sides also
-- need opposite ON DELETE rules for the same recipe foreign key, which one
-- column cannot have.

CREATE TABLE cooked_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The plan this meal fulfilled or replaced. This one column is the whole
  -- link between intention and fact.
  --   * NULL: an unplanned meal (Friday improvisation, takeout).
  --   * UNIQUE: a plan is fulfilled at most once.
  --   * SET NULL: deleting an old plan must not delete what we ate; the meal
  --     just becomes unplanned.
  -- The dates are deliberately independent: planned for Tuesday and cooked on
  -- Monday is true on both sides, and a constraint tying them would force one
  -- to lie.
  planned_meal_id UUID UNIQUE REFERENCES planned_meals(id) ON DELETE SET NULL,
  -- Calendar day; see planned_meals.planned_on for how to select it.
  cooked_on DATE NOT NULL,
  meal_slot meal_slot NOT NULL,
  -- How many people actually ate. May differ from the plan's headcount.
  headcount INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooked_meals_headcount_positive CHECK (headcount > 0)
);

-- Every read of history is "most recent first".
CREATE INDEX idx_cooked_meals_cooked_on ON cooked_meals(cooked_on DESC);

CREATE TABLE cooked_meal_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooked_meal_id UUID NOT NULL REFERENCES cooked_meals(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: deleting a recipe must not erase the fact of
  -- having eaten it. `label` keeps the row readable afterwards.
  -- Nullable from the start: "bagged salad" has no recipe.
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  -- ALWAYS populated: the recipe's name AT THE TIME (a snapshot, so renaming
  -- the recipe later leaves history reading as it did on the day), or free
  -- text when there is no recipe. History reads this and never joins recipes
  -- for a name.
  label VARCHAR(255) NOT NULL,
  -- Eaten again rather than made again. Counts toward "what did we eat",
  -- not toward "when did we last make this".
  is_leftovers BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT cooked_meal_dishes_label_not_blank CHECK (btrim(label) <> '')
);

CREATE INDEX idx_cooked_meal_dishes_cooked_meal_id ON cooked_meal_dishes(cooked_meal_id);
-- Serves "when did we last make this recipe?".
CREATE INDEX idx_cooked_meal_dishes_recipe_id ON cooked_meal_dishes(recipe_id);

-- migrate:down
DROP TABLE cooked_meal_dishes;
DROP TABLE cooked_meals;
