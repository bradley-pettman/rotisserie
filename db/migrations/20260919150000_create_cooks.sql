-- migrate:up
-- A cook is a FACT: append-only history of what was actually made, and on what
-- day. It is deliberately NOT the same thing as a meal plan item, which is an
-- INTENTION -- mutable, and may never happen. Conflating the two corrupts
-- cooking history: moving a plan item would rewrite the past, and an
-- improvised meal that was never planned would be unrepresentable.
--
-- This table lives in the recipes module on purpose. A standalone recipe book
-- with no meal planner still wants to answer "when did we last cook this?".
CREATE TABLE cooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL rather than CASCADE: see label below.
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  -- label is a SNAPSHOT -- the recipe's name at the time of cooking, or free
  -- text for takeout and improvised meals that have no recipe at all. It is
  -- always populated. Together with ON DELETE SET NULL above, that means
  -- deleting a recipe does NOT destroy the history of having cooked it: the
  -- row survives with a readable label instead of becoming an anonymous
  -- orphan. Renaming a recipe likewise leaves past cooks reading as they did
  -- on the day they happened.
  label VARCHAR(255) NOT NULL,
  cooked_on DATE NOT NULL,
  meal_slot VARCHAR(20) NOT NULL DEFAULT 'dinner',
  servings_made INTEGER,
  notes TEXT,
  -- is_leftovers marks eating a previous cook again rather than making the
  -- dish afresh. It still counts for variety purposes -- you did eat lasagne
  -- on Thursday -- but it is not a fresh cook, so "when did we last actually
  -- make this?" ignores these rows.
  is_leftovers BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cooks_meal_slot_check
    CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack'))
);

CREATE INDEX idx_cooks_recipe_id ON cooks(recipe_id);
-- Descending: every read of this table is "most recent first".
CREATE INDEX idx_cooks_cooked_on ON cooks(cooked_on DESC);

-- migrate:down
DROP TABLE cooks;
