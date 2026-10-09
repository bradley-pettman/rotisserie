-- migrate:up
-- The plan: INTENTION. What we mean to eat. Mutable, and it may never happen.
-- Moving Saturday lunch to Sunday is an ordinary edit here and must never
-- rewrite history, which lives separately in cooked_meals.
--
-- There is no meal_plans table. A plan used to be a named date range that
-- owned its items; once a meal carries its own date, "this week's plan" is
-- just the planned_meals between two dates. Reintroduce a parent table only
-- for something a date range cannot express (templates, drafts).

-- Shared by planned_meals and cooked_meals, so a cooked meal lines up with
-- the plan it replaced without translating between vocabularies. A DOMAIN
-- rather than a Postgres ENUM: adding a value to a CHECK is an ordinary
-- migration, and pg returns it as a plain string.
CREATE DOMAIN meal_slot AS VARCHAR(20)
  CHECK (VALUE IN ('breakfast', 'lunch', 'dinner', 'snack'));

CREATE TABLE planned_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A calendar day, not an instant. Select it as to_char(planned_on,
  -- 'YYYY-MM-DD') and keep it a string: pg turns DATE into a JS Date at local
  -- midnight, which shifts the day either side of UTC.
  planned_on DATE NOT NULL,
  meal_slot meal_slot NOT NULL,
  -- How many people this meal feeds. Nullable: "the usual" needs no number.
  -- Scaling a dish is headcount / recipes.servings, computed, never stored.
  headcount INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT planned_meals_headcount_positive CHECK (headcount > 0),
  -- Exactly one "Saturday lunch". Drop this to allow two dinners on one night
  -- (kids' and adults'); adding it back once duplicates exist is the hard
  -- direction, which is why it starts strict.
  --
  -- Its index leads with planned_on, so it also serves the week view's
  -- date-range query; no separate index on planned_on is needed.
  CONSTRAINT planned_meals_one_per_slot UNIQUE (planned_on, meal_slot)
);

-- One dish within a planned meal: a recipe, free text, or both (a recipe plus
-- "double it, half for the freezer").
CREATE TABLE planned_meal_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_meal_id UUID NOT NULL REFERENCES planned_meals(id) ON DELETE CASCADE,
  -- CASCADE: a plan to cook a recipe that no longer exists is meaningless.
  -- Contrast cooked_meal_dishes.recipe_id, which is SET NULL.
  -- Nullable: "dipping veggies" names no recipe.
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  -- No name snapshot here. A plan should read as the recipe is called today,
  -- so names are resolved live by joining recipes.
  custom_text VARCHAR(255),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- A dish must name SOMETHING, or it renders as a blank row.
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
