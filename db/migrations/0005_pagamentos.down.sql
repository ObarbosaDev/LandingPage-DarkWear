
UPDATE order_status_history SET origin = 'painel' WHERE origin = 'pagamento';
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_origin_check;
ALTER TABLE order_status_history
  ADD CONSTRAINT order_status_history_origin_check CHECK (origin IN ('pedido', 'painel', 'expiracao'));
DROP TABLE IF EXISTS payments;
