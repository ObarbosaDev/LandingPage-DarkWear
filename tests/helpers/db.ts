import { getDb } from "@/server/db";
import { customOrders, loginAttempts, orderItems, orders, products } from "@/server/db/schema";
import { PRODUCTS } from "@/server/db/seed-data";
import { eq } from "drizzle-orm";

// Volta o banco ao estado inicial: sem pedidos e com o estoque do catálogo de exemplo.
export async function resetDb() {
  const db = await getDb();
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(customOrders);
  await db.delete(loginAttempts);
  for (const p of PRODUCTS) {
    await db.update(products).set({ stock: p.stock, active: true }).where(eq(products.slug, p.slug));
  }
}

export async function stockOf(slug: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ stock: products.stock }).from(products).where(eq(products.slug, slug));
  return row.stock;
}
