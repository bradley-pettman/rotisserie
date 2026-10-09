-- migrate:up
ALTER TABLE planned_meals ALTER COLUMN planned_on DROP NOT NULL;

-- migrate:down
DELETE FROM planned_meals WHERE planned_on IS NULL;
ALTER TABLE planned_meals ALTER COLUMN planned_on SET NOT NULL;
