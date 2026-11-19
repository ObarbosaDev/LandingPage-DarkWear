
CREATE TABLE payments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('mercadopago')),
  preference_id text,
  provider_payment_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('iniciado', 'pendente', 'aprovado', 'recusado', 'cancelado', 'estornado')),
  method text,
  installments integer CHECK (installments IS NULL OR installments BETWEEN 1 AND 36),
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_preference_idx ON payments (preference_id);
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_origin_check;
ALTER TABLE order_status_history
  ADD CONSTRAINT order_status_history_origin_check CHECK (origin IN ('pedido', 'painel', 'expiracao', 'pagamento'));
