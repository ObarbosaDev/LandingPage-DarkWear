
CREATE TABLE order_status_history (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('pendente', 'pago', 'enviado', 'entregue', 'cancelado')),
  origin text NOT NULL CHECK (origin IN ('pedido', 'painel', 'expiracao')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, at);

INSERT INTO order_status_history (order_id, from_status, to_status, origin, at)
  SELECT id, NULL, 'pendente', 'pedido', created_at FROM orders;
INSERT INTO order_status_history (order_id, from_status, to_status, origin, at)
  SELECT id, 'pendente', status, 'painel', updated_at FROM orders WHERE status <> 'pendente';
