-- Descer APAGA o papel de todos: quem era administrador vira cliente comum e perde o acesso ao painel.
-- Depois de descer, o painel só volta a abrir quando a migração subir de novo e os administradores
-- forem recriados com "npm run admin:criar". Por isso o db:rollback exige --confirm.
DROP INDEX IF EXISTS customers_admin_idx;
ALTER TABLE customers DROP COLUMN IF EXISTS role;
