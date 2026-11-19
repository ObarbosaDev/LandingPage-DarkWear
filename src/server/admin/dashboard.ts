// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { and, asc, count, eq, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customOrders, orders, products, type OrderStatus } from "@/server/db/schema";
import { listOrders } from "@/server/admin/orders";

export async function dashboardStats() {
  const db = await getDb();
  const byStatus = await db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status);
  const [novas] = await db.select({ n: count() }).from(customOrders).where(eq(customOrders.status, "novo"));
  const lowStock = await db
    .select({ slug: products.slug, name: products.name, stock: products.stock })
    .from(products)
    .where(and(eq(products.active, true), lte(products.stock, 3)))
    .orderBy(asc(products.stock));
  const latest = await listOrders(undefined, 5);

  const n = (s: OrderStatus) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    pendentes: n("pendente"),
    pagos: n("pago"),
    enviados: n("enviado"),
    novasEncomendas: novas.n,
    lowStock,
    latest,
  };
}
