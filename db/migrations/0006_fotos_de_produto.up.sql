-- Fotos de produto enviadas pelo painel: a imagem fica no próprio banco (coluna bytea) e é entregue
-- pela rota /api/images/<id>. Assim o dono troca a foto sem mexer no projeto nem fazer novo deploy.
--   - só JPEG, PNG e WebP, até 2 MB (a aplicação confere também pelo conteúdo do arquivo);
--   - o conteúdo de uma linha nunca muda: trocar a foto cria uma linha nova (por isso a rota pode
--     usar cache "para sempre").
CREATE TABLE product_images (
  id serial PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A foto de um produto passa a poder ser um arquivo do projeto (/products/x.webp) OU uma foto enviada
-- (/api/images/<número>). A trava antiga só aceitava a primeira forma.
ALTER TABLE products DROP CONSTRAINT products_foto_caminho;
ALTER TABLE products
  ADD CONSTRAINT products_foto_caminho
  CHECK (image IS NULL OR image ~ '^/products/[A-Za-z0-9_.-]+$' OR image ~ '^/api/images/[0-9]{1,9}$');
