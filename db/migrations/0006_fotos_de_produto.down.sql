-- Descer APAGA as fotos enviadas pelo painel. Os produtos que usavam uma delas ficam sem foto
-- (mostram as iniciais) até o dono cadastrar outra.
UPDATE products SET image = NULL WHERE image ~ '^/api/images/';
ALTER TABLE products DROP CONSTRAINT products_foto_caminho;
ALTER TABLE products
  ADD CONSTRAINT products_foto_caminho CHECK (image IS NULL OR image ~ '^/products/[A-Za-z0-9_.-]+$');
DROP TABLE IF EXISTS product_images;
