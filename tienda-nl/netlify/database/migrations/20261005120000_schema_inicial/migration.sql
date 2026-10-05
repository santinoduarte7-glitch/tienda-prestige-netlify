CREATE TABLE products (
  sku text PRIMARY KEY,
  name text NOT NULL,
  category text,
  description text,
  price double precision NOT NULL CHECK (price >= 0),
  image text,
  active boolean NOT NULL DEFAULT true,
  updated_at double precision
);

CREATE TABLE orders (
  number text PRIMARY KEY,
  created_at double precision NOT NULL,
  status text NOT NULL DEFAULT 'nuevo',
  name text NOT NULL,
  legajo text NOT NULL,
  dni text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  total double precision NOT NULL
);

CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders (number) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  qty integer NOT NULL,
  price double precision NOT NULL,
  terms_accepted boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_orders_status ON orders (status, created_at);
CREATE INDEX idx_items_order ON order_items (order_number);

CREATE TABLE settings (key text PRIMARY KEY, value text NOT NULL);
INSERT INTO settings (key, value) VALUES ('access_code', 'prestige2026'), ('access_version', '1');

CREATE TABLE intentos (ip text NOT NULL, kind text NOT NULL, ts double precision NOT NULL);
