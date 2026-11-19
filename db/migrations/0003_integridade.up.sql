
ALTER TABLE products
  ADD CONSTRAINT products_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60),
  ADD CONSTRAINT products_nome_tamanho CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT products_categoria CHECK (category IN ('Pronta entrega', 'Coleção')),
  ADD CONSTRAINT products_foto_fundo CHECK (photo_bg IS NULL OR photo_bg IN ('light', 'dark')),
  ADD CONSTRAINT products_tamanhos_lista CHECK (jsonb_typeof(sizes) = 'array' AND jsonb_array_length(sizes) BETWEEN 1 AND 12),
  ADD CONSTRAINT products_cores_lista CHECK (jsonb_typeof(colors) = 'array' AND jsonb_array_length(colors) BETWEEN 1 AND 12),
  ADD CONSTRAINT products_foto_caminho CHECK (image IS NULL OR image ~ '^/products/[A-Za-z0-9_.-]+$');

ALTER TABLE orders
  ADD CONSTRAINT orders_status_valido CHECK (status IN ('pendente', 'pago', 'enviado', 'entregue', 'cancelado'));

ALTER TABLE custom_orders
  ADD CONSTRAINT custom_orders_status_valido CHECK (status IN ('novo', 'em contato', 'produzindo', 'concluído', 'cancelado'));

ALTER TABLE order_items
  ADD CONSTRAINT order_items_qty_limite CHECK (qty <= 99),
  ADD CONSTRAINT order_items_produto_fk FOREIGN KEY (product_slug) REFERENCES products (slug) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP INDEX IF EXISTS orders_status_idx;
CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX orders_pendentes_idx ON orders (created_at) WHERE status = 'pendente';
CREATE INDEX products_vitrine_idx ON products (position, created_at) WHERE active;
CREATE INDEX order_items_produto_idx ON order_items (product_slug);
CREATE INDEX custom_orders_status_created_idx ON custom_orders (status, created_at DESC);
