// ============================================================================
// Testes de SEO (src/lib/seo.ts): endereço do site, descrição para a busca e dados estruturados do produto.
// O que mais importa: o preço sai certo (centavos → reais), a disponibilidade acompanha o estoque, e um texto malicioso
// na descrição NUNCA consegue fechar a tag <script> dos dados estruturados.
// ============================================================================

import { afterEach, describe, expect, it } from "vitest";
import type { Product } from "@/lib/product";
import { descricaoParaBusca, fotoAbsoluta, jsonLdSeguro, produtoJsonLd, siteBase } from "@/lib/seo";

const peca = (o: Partial<Product> = {}): Product => ({
  slug: "oversized-gt3-rs",
  name: "Oversized GT3 RS",
  priceCents: 8990,
  description: "Camiseta preta oversized com estampa grande nas costas, em DTF.",
  category: "Pronta entrega",
  sizes: ["M"],
  colors: ["Preta"],
  stock: 5,
  variants: { "M|Preta": 5 },
  image: "/products/porsche-gt3.webp",
  ...o,
});

afterEach(() => {
  delete process.env.SITE_URL;
});

describe("siteBase", () => {
  it("usa SITE_URL sem a barra do fim", () => {
    process.env.SITE_URL = "https://darkwear.com.br/";
    expect(siteBase()).toBe("https://darkwear.com.br");
    process.env.SITE_URL = " https://darkwear.com.br// ";
    expect(siteBase()).toBe("https://darkwear.com.br");
  });
  it("sem a variável, ou com valor inválido, cai no endereço local (nunca quebra o metadataBase)", () => {
    expect(siteBase()).toBe("http://localhost:3000");
    for (const ruim of ["", "darkwear.com.br", "javascript:alert(1)", "ftp://x.com", "   "]) {
      process.env.SITE_URL = ruim;
      expect(siteBase(), ruim).toBe("http://localhost:3000");
    }
  });
});

describe("descricaoParaBusca", () => {
  it("descrição curta passa como está, sem quebras de linha", () => {
    expect(descricaoParaBusca(peca({ description: "Linha um.\n\nLinha   dois." }))).toBe("Linha um. Linha dois.");
  });
  it("descrição longa é cortada em até 160 caracteres, numa palavra, com reticências", () => {
    const longa = "palavra ".repeat(60);
    const d = descricaoParaBusca(peca({ description: longa }));
    expect(d.length).toBeLessThanOrEqual(161);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/palavr…$/);
  });
  it("sem descrição, usa o nome e a descrição da loja", () => {
    expect(descricaoParaBusca(peca({ description: "" }))).toMatch(/^Oversized GT3 RS, /);
  });
});

describe("fotoAbsoluta", () => {
  it("monta o endereço completo, ou undefined sem foto", () => {
    expect(fotoAbsoluta(peca(), "https://x.com")).toBe("https://x.com/products/porsche-gt3.webp");
    expect(fotoAbsoluta(peca({ image: "/api/images/12" }), "https://x.com")).toBe("https://x.com/api/images/12");
    expect(fotoAbsoluta(peca({ image: undefined }), "https://x.com")).toBeUndefined();
  });
});

describe("produtoJsonLd", () => {
  it("traz nome, sku, marca, foto e a oferta com o preço em reais", () => {
    const j = produtoJsonLd(peca(), "https://x.com");
    expect(j).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Oversized GT3 RS",
      sku: "oversized-gt3-rs",
      image: ["https://x.com/products/porsche-gt3.webp"],
      brand: { name: "DarkWear" },
      offers: { priceCurrency: "BRL", price: "89.90", url: "https://x.com/loja/oversized-gt3-rs", availability: "https://schema.org/InStock" },
    });
  });
  it("o preço nunca tem erro de arredondamento", () => {
    for (const [cents, texto] of [[1, "0.01"], [10, "0.10"], [8999, "89.99"], [129900, "1299.00"], [100, "1.00"]] as const) {
      expect(produtoJsonLd(peca({ priceCents: cents }), "https://x.com").offers.price, String(cents)).toBe(texto);
    }
  });
  it("esgotado vira OutOfStock; sem foto, não há campo image", () => {
    const j = produtoJsonLd(peca({ stock: 0, variants: {}, image: undefined }), "https://x.com");
    expect(j.offers.availability).toBe("https://schema.org/OutOfStock");
    expect("image" in j).toBe(false);
  });
});

describe("jsonLdSeguro", () => {
  it("uma descrição que tenta fechar a tag <script> não consegue", () => {
    const j = produtoJsonLd(peca({ description: '</script><script>alert("x")</script>' }), "https://x.com");
    const texto = jsonLdSeguro(j);
    expect(texto).not.toContain("<");
    expect(texto).not.toMatch(/<\/script/i);
    // E continua sendo JSON válido, com o mesmo conteúdo.
    expect(JSON.parse(texto).description).toBe('</script><script>alert("x")</script>');
  });
  it("o JSON continua válido e idêntico depois do escape", () => {
    const original = { a: "x</y>z", b: [1, "<"] };
    expect(JSON.parse(jsonLdSeguro(original))).toEqual(original);
  });
});
