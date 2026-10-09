-- migrate:up
-- The shared vocabularies that recipes point into: units, ingredients, tags.
--
-- Every name is stored LOWERCASE AND TRIMMED, and a CHECK enforces it. Writes
-- upsert on `ON CONFLICT (name)`, which compares bytes: if "Flour" were ever
-- stored next to the seeded "flour", the two rows would be indistinguishable
-- duplicates that no later upsert merges. Capitalization is a display concern;
-- apply it when rendering, never on the way in.
--
-- With the CHECK in force, the UNIQUE on name is already a unique index on
-- lower(name), so no functional index is needed.

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  abbreviation VARCHAR(10),
  -- volume / weight / count / other. Free text rather than a CHECK so a new
  -- category is a data change, not a migration.
  category VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT units_name_is_canonical CHECK (name = lower(btrim(name)) AND name <> '')
);

CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredients_name_is_canonical CHECK (name = lower(btrim(name)) AND name <> '')
);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tags_name_is_canonical CHECK (name = lower(btrim(name)) AND name <> '')
);

-- migrate:down
DROP TABLE tags;
DROP TABLE ingredients;
DROP TABLE units;
