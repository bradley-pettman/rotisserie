-- migrate:up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings INTEGER,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipes_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT recipes_prep_time_non_negative CHECK (prep_time_minutes >= 0),
  CONSTRAINT recipes_cook_time_non_negative CHECK (cook_time_minutes >= 0),
  CONSTRAINT recipes_servings_positive CHECK (servings > 0)
);

CREATE INDEX idx_recipes_name_trgm ON recipes USING gin ((name::text) gin_trgm_ops);

CREATE INDEX idx_recipes_created_at_id ON recipes (created_at DESC, id DESC);

CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
  quantity NUMERIC(10, 2),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT recipe_ingredients_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_recipe_ingredients_unit_id ON recipe_ingredients(unit_id);

CREATE TABLE recipe_tags (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX idx_recipe_tags_tag_id ON recipe_tags(tag_id);

-- migrate:down
DROP TABLE recipe_tags;
DROP TABLE recipe_ingredients;
DROP TABLE recipes;
