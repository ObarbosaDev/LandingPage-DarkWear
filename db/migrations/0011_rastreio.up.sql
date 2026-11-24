-- Código de rastreio do pedido: o dono informa ao marcar o pedido como enviado (opcional), e o cliente o vê em
-- "Meus pedidos". Só existe em pedido enviado ou entregue (o banco confere) e tem formato restrito: letras
-- maiúsculas e números, de 6 a 40 caracteres, para nunca guardar texto livre que vire link ou script na tela.
ALTER TABLE orders ADD COLUMN tracking_code text;
ALTER TABLE orders ADD CONSTRAINT orders_rastreio_valido CHECK (
  tracking_code IS NULL OR (tracking_code ~ '^[A-Z0-9]{6,40}$' AND status IN ('enviado', 'entregue'))
);
