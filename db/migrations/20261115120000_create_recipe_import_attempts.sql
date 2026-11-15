-- migrate:up
CREATE TABLE recipe_import_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  host VARCHAR(255) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  http_status SMALLINT,
  missing_fields TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_import_attempts_outcome_known CHECK (
    outcome IN ('imported', 'partial', 'no_recipe', 'refused', 'not_found', 'http_error', 'timeout', 'unreachable')
  ),
  CONSTRAINT recipe_import_attempts_http_status_range CHECK (http_status BETWEEN 100 AND 599),
  CONSTRAINT recipe_import_attempts_missing_fields_known CHECK (
    missing_fields <@ ARRAY['name', 'ingredients', 'steps', 'times', 'servings']::TEXT[]
  )
);

CREATE INDEX idx_recipe_import_attempts_household_created ON recipe_import_attempts(household_id, created_at DESC);

-- migrate:down
DROP TABLE recipe_import_attempts;
