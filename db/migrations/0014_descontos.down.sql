-- Descer APAGA os cupons e o registro de quanto cada pedido teve de desconto (as colunas somem). O total de cada
-- pedido (o que foi cobrado) continua como está; só deixa de ser possível separar subtotal e desconto.
DROP INDEX IF EXISTS orders_cupom_por_cliente;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_descontos_validos;
ALTER TABLE orders DROP COLUMN IF EXISTS pix_discount_cents;
ALTER TABLE orders DROP COLUMN IF EXISTS coupon_discount_cents;
ALTER TABLE orders DROP COLUMN IF EXISTS coupon_code;
DROP TABLE IF EXISTS coupons;
