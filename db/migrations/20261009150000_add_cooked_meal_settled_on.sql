-- migrate:up
ALTER TABLE cooked_meals ADD COLUMN settled_on DATE;

-- migrate:down
ALTER TABLE cooked_meals DROP COLUMN settled_on;
