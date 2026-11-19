
CREATE TABLE IF NOT EXISTS rate_limits (
  id serial PRIMARY KEY,
  bucket text NOT NULL,
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_idx ON rate_limits (bucket, key, at);
