ALTER TABLE products ADD COLUMN currency text NOT NULL DEFAULT 'ARS';
ALTER TABLE products ADD COLUMN featured boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN currency text NOT NULL DEFAULT 'ARS';
ALTER TABLE orders ADD COLUMN total_usd double precision NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN terms_version integer;

CREATE TABLE images (
  id text PRIMARY KEY,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at double precision NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('terms_version', '1'),
  ('hero_title', 'Tienda corporativa'),
  ('hero_subtitle', 'Acción comercial · Exclusivo para empleados'),
  ('hero_image', ''),
  ('logo', ''),
  ('banner', ''),
  ('store_open', '1'),
  ('closed_msg', 'La tienda está temporalmente cerrada. Volvé a intentar más tarde.'),
  ('terms', E'TÉRMINOS Y CONDICIONES – VENTA POR ACCIÓN COMERCIAL\n\n[Texto de ejemplo: reemplazar por el texto vigente desde Gestión → Contenido.]\n\n1. Alcance: la presente operación se rige por la modalidad de venta de acción comercial, exclusiva para empleados de la empresa.\n2. Precio y pago: el precio informado es el vigente al momento del pedido y se descontará según la modalidad indicada por Administración.\n3. Entrega: sujeta a disponibilidad de stock y a la coordinación con el área responsable.\n4. Cambios y devoluciones: según la política interna vigente.\n5. Datos personales: los datos ingresados se usan únicamente para gestionar el pedido.');
