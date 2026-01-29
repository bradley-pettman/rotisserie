-- migrate:up
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  abbreviation VARCHAR(10),
  category VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_units_name ON units(name);
CREATE INDEX idx_units_category ON units(category);

-- migrate:down
DROP TABLE units;
