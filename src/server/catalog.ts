import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { products, type ProductRow } from "@/server/db/schema";
import type { Product } from "@/lib/product";

// O catálogo vem do banco. Fica em cache e é invalidado pela etiqueta "products"
// sempre que estoque ou produto mudam (ver revalidateTag nas rotas de API).

function toProduct(r: ProductRow): Product {
  return {
    slug: r.slug,
    name: r.name,
    price: r.priceCents / 100,
    description: r.description,
    category: r.category as Product["category"],
    sizes: r.sizes,
    colors: r.colors,
    stock: r.stock,
    image: r.image ?? undefined,
    photoBg: (r.photoBg as Product["photoBg"]) ?? undefined,
  };
}

export async function getProducts(): Promise<Product[]> {
  "use cache";
  cacheTag("products");
  cacheLife("hours");
  const db = await getDb();
  const rows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.position));
  return rows.map(toProduct);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  "use cache";
  cacheTag("products");
  cacheLife("hours");
  const db = await getDb();
  const [row] = await db.select().from(products).where(and(eq(products.slug, slug), eq(products.active, true)));
  return row ? toProduct(row) : undefined;
}
