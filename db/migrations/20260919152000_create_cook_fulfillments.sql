-- migrate:up
-- INTEGRATION TABLE. This is the seam between two modules that do not
-- otherwise know about each other: the meal planner (INTENT -- what we meant
-- to eat) and the recipe book's cooking history (FACT -- what we actually
-- made). Neither module owns this table; the integration layer does, and
-- `app/features/integrations/plan-to-cook.ts` is the only code that reads or
-- writes it.
--
-- That ownership is the point. Dropping the integration means dropping this
-- one table: meal_plans/meal_plan_items keep working, cooks keeps working,
-- and neither loses a column or a row. Nothing in either module points here.
--
-- The link is OPTIONAL ON BOTH SIDES, which is why it is a separate table
-- rather than a nullable column on either one:
--   * a plan item may never be cooked -- you ordered pizza instead;
--   * a cook may fulfil nothing at all -- Friday improvisation.
--
-- Crucially, the two facts keep their own dates. cooks.cooked_on is NOT
-- required to equal meal_plan_items.planned_on: planning tacos for Tuesday
-- and actually cooking them on Monday is a fulfilled plan item AND a Monday
-- cook, and both statements stay true. Any constraint tying the dates
-- together would force one of them to lie.
--
-- The primary key is the pair, so the relationship is many-to-many and
-- idempotent: re-recording the same fulfilment is a no-op, one plan item can
-- be fulfilled by several cooks (a second batch on Thursday), and one cook
-- can fulfil several plan items (one pot covering Monday and Wednesday).
CREATE TABLE cook_fulfillments (
  cook_id UUID NOT NULL REFERENCES cooks(id) ON DELETE CASCADE,
  meal_plan_item_id UUID NOT NULL REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  PRIMARY KEY (cook_id, meal_plan_item_id)
);

-- The primary key already indexes the cook_id side. This covers the other
-- direction, which is the one adherence queries traverse ("was this plan item
-- ever cooked?").
CREATE INDEX idx_cook_fulfillments_meal_plan_item_id ON cook_fulfillments(meal_plan_item_id);

-- migrate:down
DROP TABLE cook_fulfillments;
