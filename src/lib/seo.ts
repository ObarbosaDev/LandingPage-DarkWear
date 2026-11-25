// ============================================================================
// SEO: o endereço do site, o resumo de uma peça para os buscadores e os dados estruturados (JSON-LD) do produto.
//
// Quem usa: o layout (metadataBase), a página da peça (/loja/[slug]), o sitemap e o robots.
// Os dados estruturados são o que faz o Google mostrar preço e disponibilidade direto no resultado da busca.
// ============================================================================

import type { Product } from "@/lib/product";
import { SITE } from "@/lib/site";

/** O endereço público do site (SITE_URL), sem barra no fim; sem a variável, o endereço local de desenvolvimento. */
export function siteBase(): string {
  const bruto = process.env.SITE_URL;
  if (typeof bruto === "string" && /^https?:\/\/[^\s/]+/i.test(bruto.trim())) return bruto.trim().replace(/\/+$/, "");
  return "http://localhost:3000";
}

/** A descrição da peça para a busca: sem quebras de linha, em no máximo 160 caracteres (corta numa palavra, com reticências). */
export function descricaoParaBusca(p: Pick<Product, "name" | "description" | "priceCents">): string {
  const texto = (p.description || `${p.name}, ${SITE.description}`).replace(/\s+/g, " ").trim();
  if (texto.length <= 160) return texto;
  const corte = texto.slice(0, 157);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), 100))}…`;
}

/** Endereço absoluto de uma foto da peça (a foto vem como caminho do próprio site), ou undefined se não tem foto. */
export function fotoAbsoluta(p: Pick<Product, "image">, base = siteBase()): string | undefined {
  return p.image ? `${base}${p.image}` : undefined;
}

/**
 * Os dados estruturados (schema.org/Product) de uma peça: nome, foto, descrição, marca e a oferta (preço em reais,
 * moeda BRL, disponível ou esgotado). O preço vem em centavos e sai em reais com duas casas.
 */
export function produtoJsonLd(p: Product, base = siteBase()) {
  const foto = fotoAbsoluta(p, base);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.slug,
    description: descricaoParaBusca(p),
    ...(foto ? { image: [foto] } : {}),
    brand: { "@type": "Brand", name: SITE.name },
    category: p.category,
    offers: {
      "@type": "Offer",
      url: `${base}/loja/${p.slug}`,
      priceCurrency: "BRL",
      price: (p.priceCents / 100).toFixed(2),
      itemCondition: "https://schema.org/NewCondition",
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

/**
 * Transforma os dados estruturados em texto seguro para ir dentro de uma tag <script>: o "<" vira o escape JSON do sinal de menor, então um
 * texto como "</script><script>..." na descrição da peça nunca fecha a tag nem injeta código na página.
 */
export function jsonLdSeguro(dados: unknown): string {
  // A barra invertida vem de String.fromCharCode(92) para este arquivo nunca conter a sequência de escape literal.
  return JSON.stringify(dados).replace(/</g, String.fromCharCode(92) + "u003c");
}
