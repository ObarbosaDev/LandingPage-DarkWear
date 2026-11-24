-- Diário do painel: quem (qual administrador) fez o quê, e quando.
--   admin_audit              uma linha por ação do painel (mudar pedido, editar produto, ajustar estoque...);
--   order_status_history.actor  o e-mail do administrador que mudou o pedido (nulo nas mudanças que não vieram do
--                               painel: pedido criado, expiração, pagamento). Guarda o TEXTO e não o id: se a conta
--                               do administrador for removida depois, o registro de quem fez continua legível.
-- O diário só cresce: nenhuma tela nem ação apaga ou edita linhas dele.
CREATE TABLE admin_audit (
  id serial PRIMARY KEY,
  actor_email text NOT NULL CHECK (char_length(actor_email) BETWEEN 3 AND 254),
  action text NOT NULL CHECK (action ~ '^[a-z]+\.[a-z-]+$'),
  target text NOT NULL DEFAULT '' CHECK (char_length(target) <= 120),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 300),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_at_idx ON admin_audit (at DESC, id DESC);

ALTER TABLE order_status_history ADD COLUMN actor text CHECK (actor IS NULL OR char_length(actor) BETWEEN 3 AND 254);
