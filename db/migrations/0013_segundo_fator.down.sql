-- Descer remove o segundo fator de todas as contas: os administradores voltam a entrar só com a senha.
-- (Os segredos guardados são apagados; para ligar de novo, rode npm run admin:2fa para cada administrador.)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_totp_passo;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_totp_formato;
ALTER TABLE customers DROP COLUMN IF EXISTS totp_last_step;
ALTER TABLE customers DROP COLUMN IF EXISTS totp_secret;
