-- migrate:up
-- The recipe book: what you know how to make.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  -- How many people one batch feeds. A meal's headcount divided by this is
  -- the scaling factor, so it must be positive when present.
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

-- Search is `name ILIKE '%term%'`. A plain btree cannot serve a leading
-- wildcard or a case-insensitive match; a trigram GIN index can.
--
-- The index is ON (name::text), not ON name: name is VARCHAR, so Postgres
-- plans the predicate as `(name)::text ~~* ...`, and an index over the bare
-- varchar column does not match that expression and is never used.
CREATE INDEX idx_recipes_name_trgm ON recipes USING gin ((name::text) gin_trgm_ops);

-- The recipe list's sort order, so paging does not need a full sort.
CREATE INDEX idx_recipes_created_at_id ON recipes (created_at DESC, id DESC);

-- One LINE of a recipe's ingredient list.
--
-- It has its own id rather than a (recipe_id, ingredient_id) key on purpose:
-- a recipe may list the same ingredient twice ("2 cups flour, divided" and
-- "1 tbsp flour for dusting").
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The line is part of the recipe and means nothing without it.
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  -- RESTRICT: "flour" cannot be deleted while a recipe still uses it.
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  -- Nullable: "3 eggs" has no unit.
  unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
  -- Nullable: "salt, to taste" has no quantity. NUMERIC, not a float, so 0.1
  -- is stored as 0.1. src/db/connection.ts parses NUMERIC to a JS number.
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

-- The primary key covers lookups by recipe; this covers "recipes with tag X".
CREATE INDEX idx_recipe_tags_tag_id ON recipe_tags(tag_id);

-- migrate:down
DROP TABLE recipe_tags;
DROP TABLE recipe_ingredients;
DROP TABLE recipes;
-- pg_trgm is left installed: other objects may depend on it, and it is inert.
