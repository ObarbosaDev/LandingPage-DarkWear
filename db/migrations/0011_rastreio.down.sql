-- Descer apaga os códigos de rastreio já informados (a coluna some). Os pedidos continuam como estão.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rastreio_valido;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_code;
