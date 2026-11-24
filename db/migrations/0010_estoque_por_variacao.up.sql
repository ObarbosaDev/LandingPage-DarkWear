-- Estoque por VARIAÇÃO (tamanho x cor): até aqui o estoque era um número só por peça, e o cliente podia
-- comprar o tamanho M de uma peça que só tinha o G. Agora cada combinação tem a sua quantidade.
--
--   product_stock   uma linha por (peça, tamanho, cor) com a quantidade; nunca negativa (o banco confere);
--   products.stock  continua existindo, mas passa a ser a SOMA das variações, mantida por um gatilho do próprio
--                   banco. Assim a vitrine, o painel e os alertas seguem lendo o total, e ele nunca diverge.
--
-- Os produtos que já existem ganham as variações com o estoque atual DIVIDIDO por igual entre as combinações
-- (o que sobra da divisão vai para as primeiras). O total de cada peça não muda; o dono ajusta a divisão no painel.
CREATE TABLE product_stock (
  product_slug text NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  size text NOT NULL CHECK (char_length(btrim(size)) BETWEEN 1 AND 20),
  color text NOT NULL CHECK (char_length(btrim(color)) BETWEEN 1 AND 20),
  stock integer NOT NULL DEFAULT 0 CONSTRAINT product_stock_nao_negativo CHECK (stock >= 0),
  PRIMARY KEY (product_slug, size, color)
);

INSERT INTO product_stock (product_slug, size, color, stock)
SELECT p.slug, s.val, c.val,
  (p.stock / n.total) + CASE WHEN ((s.ord - 1) * n.ncolors + (c.ord - 1)) < (p.stock % n.total) THEN 1 ELSE 0 END
FROM products p
CROSS JOIN LATERAL jsonb_array_elements_text(p.sizes) WITH ORDINALITY AS s(val, ord)
CROSS JOIN LATERAL jsonb_array_elements_text(p.colors) WITH ORDINALITY AS c(val, ord)
CROSS JOIN LATERAL (SELECT (jsonb_array_length(p.sizes) * jsonb_array_length(p.colors))::int AS total, jsonb_array_length(p.colors)::int AS ncolors) n
ON CONFLICT DO NOTHING;

-- A cada mudança numa variação, recalcula o total da peça. Criado DEPOIS da carga acima (que já preserva o total).
CREATE FUNCTION sync_product_stock() RETURNS trigger AS $$
DECLARE
  alvo text := COALESCE(NEW.product_slug, OLD.product_slug);
BEGIN
  UPDATE products
     SET stock = (SELECT COALESCE(SUM(ps.stock), 0) FROM product_stock ps WHERE ps.product_slug = alvo),
         updated_at = now()
   WHERE slug = alvo;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_stock_soma
AFTER INSERT OR UPDATE OF stock OR DELETE ON product_stock
FOR EACH ROW EXECUTE FUNCTION sync_product_stock();
