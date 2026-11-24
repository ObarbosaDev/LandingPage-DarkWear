-- Contas de cliente: comprar passa a exigir cadastro, e cada pedido novo fica ligado ao cliente.
--   - e-mail único e SEMPRE em minúsculas (o banco recusa o resto: "Ana@x.com" e "ana@x.com" são a mesma conta);
--   - a senha nunca é guardada, só o hash (password_hash);
--   - session_version invalida cookies antigos: trocar a senha ou "sair de todos os aparelhos" aumenta o número;
--   - must_change_password obriga a troca depois de uma senha provisória gerada pelo painel;
--   - anonymized_at marca a conta excluída: nome, e-mail e celular são apagados, mas os pedidos ficam
--     (a loja precisa guardá-los), por isso o celular só é conferido em conta ativa.
CREATE TABLE customers (
  id serial PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND email !~ '\s' AND char_length(email) BETWEEN 3 AND 254),
  phone text NOT NULL,
  password_hash text NOT NULL CHECK (password_hash <> ''),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version >= 1),
  must_change_password boolean NOT NULL DEFAULT false,
  privacy_accepted_at timestamptz NOT NULL,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_celular_valido CHECK (anonymized_at IS NOT NULL OR phone ~ '^[0-9]{10,11}$')
);
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O pedido aponta para o cliente. Anulável porque os pedidos antigos (feitos sem cadastro) não têm dono.
-- ON DELETE SET NULL: apagar um cliente de verdade nunca apaga pedido.
ALTER TABLE orders ADD COLUMN customer_id integer REFERENCES customers (id) ON DELETE SET NULL;
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
