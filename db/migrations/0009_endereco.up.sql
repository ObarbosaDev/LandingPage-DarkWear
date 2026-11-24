-- Endereço de entrega (etapa 2): um endereço por conta, e uma CÓPIA dele em cada pedido.
--   - na conta (customers.address_*): o endereço atual do cliente, que ele pode mudar quando quiser;
--   - no pedido (orders.ship_*): a cópia usada NAQUELE pedido. Mudar o endereço da conta depois não muda pedidos já
--     feitos (o pedido tem de sair para onde o cliente mandou, e não para onde ele mora hoje);
--   - "todo ou nada": ou não há endereço, ou ele está completo e válido (CEP de 8 dígitos, UF da lista, tamanhos
--     razoáveis). O complemento é opcional, mas nunca existe sozinho.
-- Pedidos antigos e conta sem endereço continuam válidos (tudo NULL).
ALTER TABLE customers
  ADD COLUMN address_zip text, ADD COLUMN address_street text, ADD COLUMN address_number text, ADD COLUMN address_complement text,
  ADD COLUMN address_district text, ADD COLUMN address_city text, ADD COLUMN address_state text;
ALTER TABLE customers ADD CONSTRAINT customers_endereco_valido CHECK (
  -- sem endereço nenhum...
  (address_zip IS NULL AND address_street IS NULL AND address_number IS NULL AND address_complement IS NULL AND address_district IS NULL AND address_city IS NULL AND address_state IS NULL)
  -- ...ou endereço COMPLETO e válido (cada campo conferido com IS NOT NULL: um NULL num CHECK passaria em silêncio)
  OR (address_zip IS NOT NULL AND address_zip ~ '^[0-9]{8}$'
      AND address_street IS NOT NULL AND char_length(btrim(address_street)) BETWEEN 2 AND 120
      AND address_number IS NOT NULL AND char_length(btrim(address_number)) BETWEEN 1 AND 10
      AND (address_complement IS NULL OR char_length(address_complement) <= 60)
      AND address_district IS NOT NULL AND char_length(btrim(address_district)) BETWEEN 2 AND 80
      AND address_city IS NOT NULL AND char_length(btrim(address_city)) BETWEEN 2 AND 80
      AND address_state IS NOT NULL AND address_state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);

ALTER TABLE orders
  ADD COLUMN ship_zip text, ADD COLUMN ship_street text, ADD COLUMN ship_number text, ADD COLUMN ship_complement text,
  ADD COLUMN ship_district text, ADD COLUMN ship_city text, ADD COLUMN ship_state text;
ALTER TABLE orders ADD CONSTRAINT orders_endereco_valido CHECK (
  -- sem endereço nenhum...
  (ship_zip IS NULL AND ship_street IS NULL AND ship_number IS NULL AND ship_complement IS NULL AND ship_district IS NULL AND ship_city IS NULL AND ship_state IS NULL)
  -- ...ou endereço COMPLETO e válido (cada campo conferido com IS NOT NULL: um NULL num CHECK passaria em silêncio)
  OR (ship_zip IS NOT NULL AND ship_zip ~ '^[0-9]{8}$'
      AND ship_street IS NOT NULL AND char_length(btrim(ship_street)) BETWEEN 2 AND 120
      AND ship_number IS NOT NULL AND char_length(btrim(ship_number)) BETWEEN 1 AND 10
      AND (ship_complement IS NULL OR char_length(ship_complement) <= 60)
      AND ship_district IS NOT NULL AND char_length(btrim(ship_district)) BETWEEN 2 AND 80
      AND ship_city IS NOT NULL AND char_length(btrim(ship_city)) BETWEEN 2 AND 80
      AND ship_state IS NOT NULL AND ship_state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);
