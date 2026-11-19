// ============================================================================
// Números do resumo do painel (a primeira tela depois do login: /admin).
//
// Quem usa: src/app/admin/(painel)/page.tsx.
// Serve para o dono bater o olho e saber "o que precisa da minha atenção agora": quantos pedidos
// esperam pagamento ou envio, se há encomendas novas e quais peças estão acabando.
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { and, asc, count, eq, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customOrders, orders, products, type OrderStatus } from "@/server/db/schema";
import { listOrders } from "@/server/admin/orders";

/** Junta todos os números do resumo numa chamada só. */
export async function dashboardStats() {
  const db = await getDb();
  // Quantos pedidos há em cada status (uma consulta agrupada, em vez de uma por status).
  const byStatus = await db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status);
  // Encomendas que ninguém atendeu ainda.
  const [novas] = await db.select({ n: count() }).from(customOrders).where(eq(customOrders.status, "novo"));
  // Estoque baixo: peças ATIVAS com 3 unidades ou menos, as mais críticas primeiro.
  // (Produto oculto não entra: o dono já decidiu não vendê-lo.)
  const lowStock = await db
    .select({ slug: products.slug, name: products.name, stock: products.stock })
    .from(products)
    .where(and(eq(products.active, true), lte(products.stock, 3)))
    .orderBy(asc(products.stock));
  // Os 5 pedidos mais recentes, para a lista "Últimos pedidos".
  const latest = await listOrders(undefined, 5);

  // Quantidade de um status (0 se nenhum pedido está nele).
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
