import type { MetadataRoute } from "next";
import { getProducts } from "@/server/catalog";

// Páginas fixas mais uma por produto ativo. O endereço do site vem de SITE_URL.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const fixas = ["", "/loja", "/personalizar", "/sobre", "/faq", "/contato"];
  const produtos = await getProducts();
  return [
    ...fixas.map((p) => ({ url: `${base}${p}` })),
    ...produtos.map((p) => ({ url: `${base}/loja/${p.slug}` })),
  ];
}
