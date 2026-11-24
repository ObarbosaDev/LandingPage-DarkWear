-- Descer APAGA todos os endereços (da conta e a cópia guardada em cada pedido). Por isso o db:rollback exige --confirm.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_endereco_valido;
ALTER TABLE orders
  DROP COLUMN IF EXISTS ship_zip, DROP COLUMN IF EXISTS ship_street, DROP COLUMN IF EXISTS ship_number, DROP COLUMN IF EXISTS ship_complement,
  DROP COLUMN IF EXISTS ship_district, DROP COLUMN IF EXISTS ship_city, DROP COLUMN IF EXISTS ship_state;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_endereco_valido;
ALTER TABLE customers
  DROP COLUMN IF EXISTS address_zip, DROP COLUMN IF EXISTS address_street, DROP COLUMN IF EXISTS address_number, DROP COLUMN IF EXISTS address_complement,
  DROP COLUMN IF EXISTS address_district, DROP COLUMN IF EXISTS address_city, DROP COLUMN IF EXISTS address_state;
