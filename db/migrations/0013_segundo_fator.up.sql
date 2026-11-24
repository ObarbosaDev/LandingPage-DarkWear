-- Segundo fator (código do aplicativo autenticador) para administradores.
--   totp_secret     o segredo do autenticador, CIFRADO pela aplicação (AES-256-GCM): o banco nunca guarda o segredo em
--                   claro, então quem só lê o banco não consegue gerar os códigos. Nulo = a conta não usa segundo fator;
--   totp_last_step  o último passo de 30 segundos já aceito: cada código só vale uma vez (reuso é recusado).
-- Só o comando de terminal do dono liga e desliga o segundo fator (npm run admin:2fa); nenhuma tela escreve isto.
ALTER TABLE customers ADD COLUMN totp_secret text;
ALTER TABLE customers ADD COLUMN totp_last_step bigint NOT NULL DEFAULT 0;
-- O segredo cifrado tem formato próprio (v1.<iv>.<marca>.<texto>): lixo é recusado pelo banco.
ALTER TABLE customers ADD CONSTRAINT customers_totp_formato CHECK (totp_secret IS NULL OR totp_secret ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$');
ALTER TABLE customers ADD CONSTRAINT customers_totp_passo CHECK (totp_last_step >= 0);
