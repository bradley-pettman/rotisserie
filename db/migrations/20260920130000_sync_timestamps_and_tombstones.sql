-- migrate:up

-- ---------------------------------------------------------------------------
-- WHAT A CACHE NEEDS AND THIS SCHEMA CANNOT SAY: A ROW'S AGE, AND ITS ABSENCE.
--
-- Every table here answers "what is there?" and none answers "what changed?".
-- A client that keeps a copy -- the agent between runs, and any offline client
-- that comes after it -- can therefore only refresh by downloading the whole
-- library again. Two holes make a smaller refresh impossible, and they are the
-- two this migration closes: plan items carry no timestamps at all, and a
-- deleted row leaves nothing behind for anyone to notice.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. meal_plan_items GETS created_at AND updated_at.
--
--    `recipes` has both. `cooks` has created_at and is append-only, which is
--    the whole story for a table nothing ever edits. `meal_plan_items` has
--    neither -- and it is the one table here that exists to be rewritten: a
--    plan item is an INTENTION (20260919151000), so moving Tuesday's tacos to
--    Wednesday is an ordinary edit rather than an exception. The table whose
--    rows are meant to move is the table with nothing recording that they did.
--
--    HOW updated_at IS KEPT CURRENT: BY THE APPLICATION, matching `recipes`.
--    `updateRecipe` pushes `updated_at = NOW()` into its SET list; there is no
--    trigger on `recipes` and, before this migration, no trigger anywhere in
--    this schema. `moveMealPlanItem` now does the same thing in the same way.
--
--    A BEFORE UPDATE trigger is the more robust mechanism taken in isolation,
--    and it is deliberately not used. Adding one would leave this schema
--    holding two different answers to "how does updated_at stay current?", and
--    the next person to write an UPDATE would have to know which table follows
--    which rule before their column could be trusted. One mechanism that can
--    be forgotten beats two that must be told apart. If that trade stops
--    paying, the fix is a trigger on BOTH tables in one migration -- not a
--    second exception here.
--
--    The tombstone triggers in section 2 are not a contradiction of that. A
--    row can be DELETEd with no application code running at all, because
--    cascades do it; an UPDATE to a plan item has no such path, and happens
--    only because a query function ran. The mechanism follows the reachability
--    of the event, which is the distinction worth holding onto.
ALTER TABLE meal_plan_items
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

--    Backfill from the parent plan, rather than leaving every existing row
--    claiming it came into being the moment this migration ran.
--    `meal_plans.created_at` is a true LOWER BOUND -- an item cannot predate
--    the plan it hangs off -- so the only rows this approximates are those
--    added to a plan after it was made, and it errs in the direction that
--    makes a week-old plan read as a week old.
--
--    Both choices are safe for delta sync, which is worth stating because it
--    is the reason not to agonise over the approximation: nothing can have
--    been syncing this table before, the columns did not exist, so no client
--    holds a cursor that a backfilled timestamp could cause it to skip past.
UPDATE meal_plan_items i
SET created_at = p.created_at,
    updated_at = p.created_at
FROM meal_plans p
WHERE i.meal_plan_id = p.id
  AND p.created_at < i.created_at;

--    NOTE for whoever implements the sync client: `meal_plans.updated_at`
--    exists but has no writer, because no code updates a plan row -- a plan's
--    name and dates are set at creation and never edited. A plan's own
--    updated_at therefore equals its created_at, and all of the planner's
--    mutability lives in its items. That is a fact about today's query layer,
--    not a promise; the moment an UPDATE on `meal_plans` is written it has to
--    set updated_at = NOW() the same way, for the same reason.


-- ---------------------------------------------------------------------------
-- 2. TOMBSTONES: DELETES BECOME OBSERVABLE.
--
--    A client holding a cached recipe or plan item has no way to learn that it
--    is gone. Absence is not a thing an API can return: the row simply stops
--    appearing, and telling "deleted" apart from "not on this page", "filtered
--    out" or "the request failed" is impossible from the outside. The only
--    honest refresh available today is a full refetch of everything, which is
--    precisely what a delta sync is supposed to avoid.
--
--    THIS IS DONE IN THE DATABASE, WITH AFTER DELETE TRIGGERS, AND THAT IS THE
--    LOAD-BEARING PART OF THE DESIGN. Two reasons:
--
--    (a) ROWS DISAPPEAR WITHOUT APPLICATION CODE RUNNING. meal_plan_items.
--        recipe_id is ON DELETE CASCADE and meal_plans cascades to its items,
--        so `deleteRecipe` issues one DELETE against `recipes` and Postgres
--        silently removes every plan item that referenced it. A tombstone
--        written next to each DELETE in the query modules would miss exactly
--        those rows -- and they are the ones a client is most likely to still
--        be holding, because nobody ever asked for them to go away. A
--        mechanism that covers the deletes you remember and not the ones the
--        schema performs on your behalf is worse than none: it looks complete.
--
--    (b) IT KEEPS THE CHANGE OUT OF EVERY DELETE PATH. There is no edit to
--        `deleteRecipe`, `deleteCook`, `deleteMealPlan`, `removeMealPlanItem`
--        or anything written after them. A future delete path is covered on
--        the day it is written, by having been written at all, which is the
--        only kind of coverage that survives the next contributor.
--
--    WHAT A CLIENT NEEDS TO ACT ON A TOMBSTONE is which table, which id and
--    when -- enough to evict one row from one cache and to know whether it has
--    already seen the event. There is nothing else to keep: the row is gone,
--    and a tombstone that tried to preserve its contents would be a second,
--    unreachable copy of data the user asked to destroy.
CREATE TABLE deletions (
  -- The table the row lived in, written from TG_TABLE_NAME rather than spelled
  -- out per trigger, so one function serves all four and a fifth table joins by
  -- adding a trigger and nothing else.
  --
  -- The value is the PHYSICAL TABLE NAME and travels to clients as such
  -- ('meal_plan_items', not 'mealPlanItem'). Translating at the API boundary
  -- would read tidier beside a camelCase envelope, and would buy that tidiness
  -- with a second vocabulary somebody has to keep in step with this one by
  -- hand. The client contract for a tombstone is "forget this row", and the
  -- table name is the one label that cannot silently disagree with what the
  -- trigger wrote.
  --
  -- Deliberately NOT a CHECK against a fixed list of tables. The list would
  -- have to be edited in the same breath as any new trigger, and forgetting it
  -- would abort a user's DELETE -- failing the operation to punish a stale
  -- constraint. The vocabulary is documented in app/db/deletions.ts instead,
  -- where being out of date costs a type and not a transaction.
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The pair IS the identity, as in cook_fulfillments: one row per deleted
  -- entity, not one per delete event. That matters now that clients may supply
  -- their own ids (`cooks` already accepts one, so a retry collapses onto the
  -- original row) -- an id can be deleted, re-created and deleted again, and a
  -- surrogate key would let two live tombstones disagree about whether that id
  -- is gone. The upsert in record_deletion() below refreshes the timestamp
  -- instead, so the latest answer is the only answer, and a second delete of a
  -- resurrected id cannot fail on a unique violation and take the user's
  -- DELETE down with it.
  PRIMARY KEY (table_name, row_id)
);

-- The one query this table exists to serve: "everything deleted since <t>",
-- oldest first, so a client can advance a cursor through it. deleted_at leads
-- because that is the range scan; the other two columns follow to give the
-- ORDER BY its tiebreak for free and to make the read index-only -- this table
-- has three columns, so the index covers every one of them.
CREATE INDEX idx_deletions_deleted_at ON deletions (deleted_at, table_name, row_id);

-- One function, four triggers. AFTER, not BEFORE: the row is confirmed gone by
-- the time this runs, and a BEFORE trigger returning NULL would CANCEL the
-- delete it was supposed to record.
--
-- NOW() is transaction start time, not wall clock, so every tombstone written
-- by one DELETE -- the recipe and all of the plan items that cascaded from it
-- -- carries an identical timestamp. That is the behaviour we want: those
-- deletions happened together and a client should see them in one batch, never
-- straddling a cursor.
CREATE FUNCTION record_deletion() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO deletions (table_name, row_id)
  VALUES (TG_TABLE_NAME, OLD.id)
  ON CONFLICT (table_name, row_id) DO UPDATE SET deleted_at = NOW();

  -- The return value of an AFTER ... FOR EACH ROW trigger is ignored.
  RETURN NULL;
END;
$$;

CREATE TRIGGER recipes_record_deletion
  AFTER DELETE ON recipes
  FOR EACH ROW EXECUTE FUNCTION record_deletion();

CREATE TRIGGER cooks_record_deletion
  AFTER DELETE ON cooks
  FOR EACH ROW EXECUTE FUNCTION record_deletion();

CREATE TRIGGER meal_plans_record_deletion
  AFTER DELETE ON meal_plans
  FOR EACH ROW EXECUTE FUNCTION record_deletion();

CREATE TRIGGER meal_plan_items_record_deletion
  AFTER DELETE ON meal_plan_items
  FOR EACH ROW EXECUTE FUNCTION record_deletion();

-- ---------------------------------------------------------------------------
--    WHAT IS DELIBERATELY NOT COVERED, and why each omission is an argument
--    rather than an oversight:
--
--    * cook_fulfillments has no id of its own -- the pair of foreign keys IS
--      its primary key (20260919152000) -- so it does not fit (table, row_id)
--      at all. This is the one honest GAP rather than a clean omission: both
--      ends cascade, so most disappearances are covered by the tombstone for
--      the cook or the plan item, but `unfulfilPlanItem` removes a link while
--      both ends survive and nothing here records that. What it costs is
--      bounded: fulfilment is not a row a client lists on its own, it is a
--      tick against a plan item, and GET /api/meal-plans/:id/adherence
--      re-derives the whole plan's worth in one request. Closing it properly
--      means either a surrogate key on that table or a tombstone shape
--      carrying two ids, and neither is worth doing before a client exists
--      that would notice.
--
--    * recipe_ingredients and recipe_tags are parts of a recipe, not rows a
--      client caches independently. They arrive inside the recipe document and
--      are replaced wholesale with it; a client that re-reads the recipe has
--      already learned which lines are gone.
--
--    * ingredients, units and tags are small controlled vocabularies whose
--      endpoints return the ENTIRE list every time. Absence from that list is
--      already the tombstone, and it is a complete one, which is more than a
--      deletions row could claim.
--
--    ONE ASYMMETRY THAT TOMBSTONES CANNOT REACH, stated here because a sync
--    client will otherwise meet it as a mystery. cooks.recipe_id is ON DELETE
--    SET NULL (20260919150000), so deleting a recipe MUTATES surviving cooks
--    instead of deleting them -- and `cooks` has no updated_at to advertise
--    that a row it already handed out has changed. A cached cook therefore
--    keeps pointing at a recipe that no longer exists.
--
--    That is acceptable, and the snapshot `label` is the reason. History
--    renders from cooks.label and never joins to `recipes`, so the stale id
--    cannot make a history row read wrongly -- it reads identically before and
--    after, which is exactly what SET NULL plus a label was designed to
--    guarantee. The one thing a stale id can do is make a client believe the
--    recipe is still there.
--
--    And that needs no column to fix, because the information is already in
--    the stream: the same `?since` window that fails to mention the cook DOES
--    carry the `recipes` tombstone for the id it points at. A client applying
--    a recipes tombstone clears any cached cooks.recipe_id referencing it --
--    performing locally exactly what the foreign key did server-side. That
--    rule is a client contract, so it is restated in app/routes/api.deletions.ts
--    where a client author will actually read it.
--
--    RETENTION IS NOT SOLVED HERE, AND IT WILL HAVE TO BE. Tombstones
--    accumulate forever: one row per entity ever deleted, growing with churn
--    and never shrinking. At family scale that is a few thousand rows a decade
--    and not worth pre-empting, so this migration deliberately ships no
--    pruning.
--
--    The unsolved part is not the DELETE statement, though -- it is the
--    contract. Once rows older than a window are pruned, a client whose cursor
--    predates that window is told "nothing was deleted" when the truth is
--    "more was deleted than I can still tell you about", and it keeps serving
--    rows that are gone while believing it is in sync. Pruning therefore has
--    to arrive together with a way for GET /api/deletions to refuse a cursor
--    it can no longer honour (a 410, or a horizon in the envelope's meta) and
--    for the client to fall back to a full refetch. Shipping the DELETE on its
--    own would quietly convert a correct delta sync into a confident lie,
--    which is a worse outcome than an unbounded table.
-- ---------------------------------------------------------------------------


-- migrate:down

DROP TRIGGER meal_plan_items_record_deletion ON meal_plan_items;
DROP TRIGGER meal_plans_record_deletion ON meal_plans;
DROP TRIGGER cooks_record_deletion ON cooks;
DROP TRIGGER recipes_record_deletion ON recipes;

DROP FUNCTION record_deletion();

-- Every tombstone goes with the table, and that is the honest reverse: a
-- tombstone is a statement about a row that no longer exists, so there is
-- nothing to preserve it against. Any client that synced against this endpoint
-- has to full-refetch after a rollback, which is the same position it was in
-- before the migration ran.
DROP TABLE deletions;

ALTER TABLE meal_plan_items
  DROP COLUMN updated_at,
  DROP COLUMN created_at;
