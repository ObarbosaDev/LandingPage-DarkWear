
DROP INDEX IF EXISTS custom_orders_status_created_idx;
DROP INDEX IF EXISTS order_items_produto_idx;
DROP INDEX IF EXISTS products_vitrine_idx;
DROP INDEX IF EXISTS orders_pendentes_idx;
DROP INDEX IF EXISTS orders_status_created_idx;
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
DROP TRIGGER IF EXISTS products_set_updated_at ON products;
DROP FUNCTION IF EXISTS set_updated_at();

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_produto_fk,
  DROP CONSTRAINT IF EXISTS order_items_qty_limite;
ALTER TABLE custom_orders DROP CONSTRAINT IF EXISTS custom_orders_status_valido;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_valido;
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_foto_caminho,
  DROP CONSTRAINT IF EXISTS products_cores_lista,
  DROP CONSTRAINT IF EXISTS products_tamanhos_lista,
  DROP CONSTRAINT IF EXISTS products_foto_fundo,
  DROP CONSTRAINT IF EXISTS products_categoria,
  DROP CONSTRAINT IF EXISTS products_nome_tamanho,
  DROP CONSTRAINT IF EXISTS products_slug_formato;
