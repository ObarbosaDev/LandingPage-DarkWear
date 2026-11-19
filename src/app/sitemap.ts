// ============================================================================
// sitemap.xml: a lista de todas as páginas públicas do site, para os buscadores (Google etc.)
// encontrarem tudo. O Next gera o arquivo /sitemap.xml a partir desta função.
//
// Inclui as páginas fixas e UMA entrada por peça ativa da loja. Quando o dono cria ou oculta uma
// peça, o sitemap acompanha, porque lê o mesmo catálogo da vitrine.
// ============================================================================

import type { MetadataRoute } from "next";
import { getProducts } from "@/server/catalog";

// Páginas fixas mais uma por produto ativo. O endereço do site vem de SITE_URL.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Os endereços no sitemap precisam ser completos (com o domínio), por isso SITE_URL.
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  // "" é a home; os demais são as páginas do site (o carrinho fica de fora: não interessa a buscadores).
  const fixas = ["", "/loja", "/personalizar", "/sobre", "/faq", "/contato"];
  const produtos = await getProducts();
  return [
    ...fixas.map((p) => ({ url: `${base}${p}` })),
    ...produtos.map((p) => ({ url: `${base}/loja/${p.slug}` })),
  ];
}
