-- Descer remove a divisão por tamanho e cor. O total de cada peça (products.stock) já está certo (o gatilho o
-- mantinha), então nenhuma peça perde o estoque total; só some a informação de quanto havia em cada variação.
DROP TRIGGER IF EXISTS product_stock_soma ON product_stock;
DROP FUNCTION IF EXISTS sync_product_stock();
DROP TABLE IF EXISTS product_stock;
