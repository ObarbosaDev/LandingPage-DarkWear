// ============================================================================
// Leitura do catálogo da loja (o que o CLIENTE vê).
//
// Quem usa:
//   - home (/), loja (/loja) e página de produto (/loja/[slug]);
//   - GET /api/products e o sitemap.
// A edição do catálogo (o que o DONO faz) fica em src/server/admin/products.ts.
//
// Por que existe uma camada de cache aqui: a vitrine é a parte mais acessada do site e o catálogo
// muda pouco. Em vez de consultar o banco a cada visita, o resultado fica guardado e é descartado
// na hora em que algo muda (pedido novo baixou estoque, dono editou um produto...).
// ============================================================================

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { productStock, products, type ProductRow } from "@/server/db/schema";
import { chaveDaVariacao, type EstoquePorVariacao } from "@/lib/variants";
import type { Product } from "@/lib/product";

// O catálogo vem do banco. Fica em cache e é invalidado pela etiqueta "products"
// sempre que estoque ou produto mudam (ver revalidateTag nas rotas de API).

/**
 * Converte a linha do banco (ProductRow) no formato que as telas usam (Product).
 * Existe para a tela receber só o necessário e com tipos mais precisos (ex.: a categoria como uma
 * das duas opções válidas, e campos vazios como "ausente" em vez de null).
 */
function toProduct(r: ProductRow, variants: EstoquePorVariacao): Product {
  return {
    slug: r.slug,
    name: r.name,
    priceCents: r.priceCents,
    description: r.description,
    category: r.category as Product["category"],
    sizes: r.sizes,
    colors: r.colors,
    stock: r.stock,
    variants,
    image: r.image ?? undefined,
    photoBg: (r.photoBg as Product["photoBg"]) ?? undefined,
  };
}

/** O estoque de todas as variações, agrupado por peça (uma consulta só para a vitrine inteira). */
async function variantsBySlug(db: Awaited<ReturnType<typeof getDb>>) {
  const linhas = await db.select().from(productStock);
  const mapa = new Map<string, EstoquePorVariacao>();
  for (const v of linhas) {
    const atual = mapa.get(v.productSlug) ?? {};
    atual[chaveDaVariacao(v.size, v.color)] = v.stock;
    mapa.set(v.productSlug, atual);
  }
  return mapa;
}

/**
 * Todas as peças ATIVAS (as ocultas pelo dono não aparecem), na ordem definida no painel.
 * A diretiva "use cache" guarda o resultado; a etiqueta "products" permite descartá-lo de uma vez
 * (revalidateTag/updateTag), e "hours" é o prazo máximo de validade caso ninguém o descarte antes.
 */
export async function getProducts(): Promise<Product[]> {
  "use cache";
  cacheTag("products");
  cacheLife("hours");
  const db = await getDb();
  const rows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.position));
  const porPeca = await variantsBySlug(db);
  return rows.map((r) => toProduct(r, porPeca.get(r.slug) ?? {}));
}

/**
 * Uma peça pelo endereço (slug), ou undefined se não existir ou estiver oculta.
 * Usada pela página /loja/[slug]; quem recebe undefined mostra a página 404.
 */
export async function getProduct(slug: string): Promise<Product | undefined> {
  "use cache";
  cacheTag("products");
  cacheLife("hours");
  const db = await getDb();
  const [row] = await db.select().from(products).where(and(eq(products.slug, slug), eq(products.active, true)));
  if (!row) return undefined;
  const linhas = await db.select().from(productStock).where(eq(productStock.productSlug, slug));
  return toProduct(row, Object.fromEntries(linhas.map((v) => [chaveDaVariacao(v.size, v.color), v.stock])));
}
