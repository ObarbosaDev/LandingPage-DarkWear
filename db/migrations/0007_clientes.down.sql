-- Descer APAGA todas as contas de cliente (nome, e-mail, celular, senha) e desliga os pedidos de quem os
-- fez: os pedidos continuam, mas sem dono. Por isso o db:rollback exige --confirm.
DROP INDEX IF EXISTS orders_customer_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_id;
DROP TABLE IF EXISTS customers;
