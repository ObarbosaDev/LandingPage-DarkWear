-- Cupons de desconto e desconto no Pix.
--   coupons                 os cupons que o dono cria no painel (percentual de 1 a 90% ou valor fixo), com pedido
--                           mínimo, limite de usos, validade e liga/desliga. Nunca são apagados (o pedido aponta
--                           para eles): o dono desativa;
--   orders.coupon_code      o cupom usado no pedido (nulo = nenhum);
--   orders.coupon_discount_cents / pix_discount_cents  quanto cada desconto tirou, em centavos. O total do pedido
--                           (orders.total_cents) continua sendo o que o cliente PAGA, já com os descontos: o subtotal
--                           é total + descontos. Pedidos antigos ficam com 0 nos dois.
-- Um cupom só pode ser usado UMA vez por cliente em pedidos não cancelados: quem garante é o banco (índice único
-- parcial), então dois pedidos simultâneos com o mesmo cupom nunca passam os dois. Cancelar o pedido libera o cupom.
CREATE TABLE coupons (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  kind text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value integer NOT NULL CHECK (value > 0),
  min_order_cents integer NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percentual CHECK (kind <> 'percent' OR value BETWEEN 1 AND 90),
  CONSTRAINT coupons_valor_fixo CHECK (kind <> 'fixed' OR value <= 1000000),
  CONSTRAINT coupons_usos CHECK (max_uses IS NULL OR used_count <= max_uses),
  CONSTRAINT coupons_periodo CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at)
);

ALTER TABLE orders ADD COLUMN coupon_code text REFERENCES coupons(code);
ALTER TABLE orders ADD COLUMN coupon_discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN pix_discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD CONSTRAINT orders_descontos_validos CHECK (
  coupon_discount_cents >= 0 AND pix_discount_cents >= 0 AND (coupon_discount_cents = 0 OR coupon_code IS NOT NULL)
);
CREATE UNIQUE INDEX orders_cupom_por_cliente ON orders (customer_id, coupon_code)
  WHERE coupon_code IS NOT NULL AND status <> 'cancelado';
