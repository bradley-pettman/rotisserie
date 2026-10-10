-- migrate:up
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_is_canonical CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT users_display_name_not_blank CHECK (btrim(display_name) <> '')
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT sessions_token_hash_is_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- migrate:down
DROP TABLE sessions;
DROP TABLE users;
