-- Seed common cooking units
-- Use INSERT ... ON CONFLICT DO NOTHING for idempotency

-- Volume
INSERT INTO units (name, abbreviation, category, is_standard)
SELECT name, abbreviation, category, TRUE FROM (VALUES
  ('cup', 'cup', 'volume'),
  ('tablespoon', 'tbsp', 'volume'),
  ('teaspoon', 'tsp', 'volume'),
  ('fluid ounce', 'fl oz', 'volume'),
  ('milliliter', 'ml', 'volume'),
  ('liter', 'l', 'volume'),
  ('pint', 'pt', 'volume'),
  ('quart', 'qt', 'volume'),
  ('gallon', 'gal', 'volume')
) AS seed(name, abbreviation, category)
ON CONFLICT (name) DO UPDATE SET is_standard = TRUE;

-- Weight
INSERT INTO units (name, abbreviation, category, is_standard)
SELECT name, abbreviation, category, TRUE FROM (VALUES
  ('ounce', 'oz', 'weight'),
  ('pound', 'lb', 'weight'),
  ('gram', 'g', 'weight'),
  ('kilogram', 'kg', 'weight')
) AS seed(name, abbreviation, category)
ON CONFLICT (name) DO UPDATE SET is_standard = TRUE;

-- Count
INSERT INTO units (name, abbreviation, category, is_standard)
SELECT name, abbreviation, category, TRUE FROM (VALUES
  ('piece', 'pc', 'count'),
  ('whole', NULL, 'count'),
  ('slice', NULL, 'count'),
  ('clove', NULL, 'count'),
  ('bunch', NULL, 'count'),
  ('pinch', NULL, 'count'),
  ('dash', NULL, 'count'),
  ('handful', NULL, 'count'),
  ('sprig', NULL, 'count'),
  ('head', NULL, 'count'),
  ('stalk', NULL, 'count'),
  ('leaf', NULL, 'count')
) AS seed(name, abbreviation, category)
ON CONFLICT (name) DO UPDATE SET is_standard = TRUE;

-- Other/Container
INSERT INTO units (name, abbreviation, category, is_standard)
SELECT name, abbreviation, category, TRUE FROM (VALUES
  ('can', NULL, 'other'),
  ('package', 'pkg', 'other'),
  ('jar', NULL, 'other'),
  ('bottle', NULL, 'other'),
  ('bag', NULL, 'other'),
  ('box', NULL, 'other'),
  ('stick', NULL, 'other'),
  ('cube', NULL, 'other')
) AS seed(name, abbreviation, category)
ON CONFLICT (name) DO UPDATE SET is_standard = TRUE;
