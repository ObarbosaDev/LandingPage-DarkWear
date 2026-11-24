-- Papel de administrador: quem administra a loja é uma CONTA comum com o papel "admin". Entra pela mesma
-- tela de todo mundo, com e-mail e senha pessoais, e é levada ao painel. Isso substitui a senha única
-- compartilhada do painel (ADMIN_PASSWORD): agora cada pessoa tem a sua, e dá para tirar o acesso de uma
-- sem trocar a senha de todas.
--   - o papel NUNCA é concedido pelo site (cadastro, formulário, API): só por comando de terminal do dono
--     (npm run admin:criar), que escreve esta coluna direto no banco;
--   - o banco recusa qualquer valor fora de 'cliente' e 'admin'.
ALTER TABLE customers ADD COLUMN role text NOT NULL DEFAULT 'cliente' CHECK (role IN ('cliente', 'admin'));
-- Achar os administradores rápido (são poucos): índice parcial, só nas linhas com papel admin.
CREATE INDEX customers_admin_idx ON customers (id) WHERE role = 'admin';
