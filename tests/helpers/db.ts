// ============================================================================
// Ajudantes de banco para os testes: deixar o banco num estado conhecido e ler o estoque.
// ============================================================================

import { getDb } from "@/server/db";
import { customOrders, loginAttempts, orderItems, orders, products } from "@/server/db/schema";
import { PRODUCTS } from "@/server/db/seed-data";
import { eq } from "drizzle-orm";

// Volta o banco ao estado inicial: sem pedidos e com o estoque do catálogo de exemplo.
// Chamada no início de cada teste (beforeEach) para um teste nunca depender do que outro deixou.
export async function resetDb() {
  const db = await getDb();
  // A ordem importa: os itens do pedido dependem do pedido, então saem primeiro.
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(customOrders);
  await db.delete(loginAttempts);
  // Devolve cada produto do catálogo de exemplo ao estoque inicial e reativa (um teste pode ter ocultado).
  for (const p of PRODUCTS) {
    await db.update(products).set({ stock: p.stock, active: true }).where(eq(products.slug, p.slug));
  }
}

/** Quantas peças há em estoque de um produto, lido direto do banco. */
export async function stockOf(slug: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ stock: products.stock }).from(products).where(eq(products.slug, slug));
  return row.stock;
}
