-- Descer APAGA o diário do painel (a tabela some) e o nome de quem mudou cada pedido no histórico.
-- Os pedidos e o histórico de status em si continuam. Por isso o db:rollback exige --confirm.
ALTER TABLE order_status_history DROP COLUMN IF EXISTS actor;
DROP INDEX IF EXISTS admin_audit_at_idx;
DROP TABLE IF EXISTS admin_audit;
