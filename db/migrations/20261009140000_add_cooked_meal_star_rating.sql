-- migrate:up
ALTER TABLE cooked_meals
  ADD COLUMN star_rating SMALLINT,
  ADD CONSTRAINT cooked_meals_star_rating_range CHECK (star_rating BETWEEN 1 AND 5);

-- migrate:down
ALTER TABLE cooked_meals DROP COLUMN star_rating;
