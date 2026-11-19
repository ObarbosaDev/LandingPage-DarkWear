// Esquema inicial (migração 0001_baseline), em SQL puro e idempotente: roda igual no Postgres embutido
// (desenvolvimento) e no Neon (produção). NÃO edite: mudanças novas entram como migrações em migrations.ts.
export const DDL = `
CREATE TABLE IF NOT EXISTS products (
  slug text PRIMARY KEY,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  sizes jsonb NOT NULL,
  colors jsonb NOT NULL,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image text,
  photo_bg text,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  status text NOT NULL DEFAULT 'pendente',
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  name text NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS custom_orders (
  id serial PRIMARY KEY,
  status text NOT NULL DEFAULT 'novo',
  name text NOT NULL DEFAULT '',
  model text NOT NULL,
  color text NOT NULL,
  size text NOT NULL,
  placement text NOT NULL,
  notes text NOT NULL DEFAULT '',
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_orders_created_idx ON custom_orders (created_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id serial PRIMARY KEY,
  key text NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_key_idx ON login_attempts (key, failed_at);
`;
