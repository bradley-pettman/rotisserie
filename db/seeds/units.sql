-- Seed common cooking units
-- Use INSERT ... ON CONFLICT DO NOTHING for idempotency

-- Volume
INSERT INTO units (name, abbreviation, category) VALUES
  ('cup', 'cup', 'volume'),
  ('tablespoon', 'tbsp', 'volume'),
  ('teaspoon', 'tsp', 'volume'),
  ('fluid ounce', 'fl oz', 'volume'),
  ('milliliter', 'ml', 'volume'),
  ('liter', 'l', 'volume'),
  ('pint', 'pt', 'volume'),
  ('quart', 'qt', 'volume'),
  ('gallon', 'gal', 'volume')
ON CONFLICT (name) DO NOTHING;

-- Weight
INSERT INTO units (name, abbreviation, category) VALUES
  ('ounce', 'oz', 'weight'),
  ('pound', 'lb', 'weight'),
  ('gram', 'g', 'weight'),
  ('kilogram', 'kg', 'weight')
ON CONFLICT (name) DO NOTHING;

-- Count
INSERT INTO units (name, abbreviation, category) VALUES
  ('piece', 'pc', 'count'),
  ('whole', NULL, 'count'),
  ('slice', NULL, 'count'),
  ('clove', NULL, 'count'),
  ('bunch', NULL, 'count'),
  ('pinch', NULL, 'count'),
  ('dash', NULL, 'count'),
  ('sprig', NULL, 'count'),
  ('head', NULL, 'count'),
  ('stalk', NULL, 'count'),
  ('leaf', NULL, 'count')
ON CONFLICT (name) DO NOTHING;

-- Other/Container
INSERT INTO units (name, abbreviation, category) VALUES
  ('can', NULL, 'other'),
  ('package', 'pkg', 'other'),
  ('jar', NULL, 'other'),
  ('bottle', NULL, 'other'),
  ('bag', NULL, 'other'),
  ('box', NULL, 'other'),
  ('stick', NULL, 'other'),
  ('cube', NULL, 'other')
ON CONFLICT (name) DO NOTHING;
