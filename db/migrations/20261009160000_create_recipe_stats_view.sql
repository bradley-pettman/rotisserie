-- migrate:up
CREATE VIEW recipe_stats AS
SELECT
  r.id AS recipe_id,
  made.average_rating,
  made.rating_count,
  made.times_made,
  made.last_made_on
FROM recipes r
CROSS JOIN LATERAL (
  SELECT
    AVG(meal.star_rating) AS average_rating,
    COUNT(meal.star_rating)::int AS rating_count,
    COUNT(meal.id)::int AS times_made,
    MAX(meal.cooked_on) AS last_made_on
  FROM (
    SELECT DISTINCT cm.id, cm.star_rating, cm.cooked_on
    FROM cooked_meal_dishes d
    JOIN cooked_meals cm ON cm.id = d.cooked_meal_id
    WHERE d.recipe_id = r.id AND NOT d.is_leftovers
  ) meal
) made;

-- migrate:down
DROP VIEW recipe_stats;
