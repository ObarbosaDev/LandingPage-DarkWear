// ============================================================================
// Números do resumo do painel (a primeira tela depois do login: /admin).
//
// Quem usa: src/app/admin/(painel)/page.tsx.
// Serve para o dono bater o olho e saber "o que precisa da minha atenção agora": quantos pedidos
// esperam pagamento ou envio, se há encomendas novas e quais peças estão acabando.
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { and, asc, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customOrders, customers, orders, payments, products, type OrderStatus } from "@/server/db/schema";
import { listOrders } from "@/server/admin/orders";

/**
 * Os dois números pequenos da barra de navegação do painel: pedidos esperando pagamento e encomendas que ninguém
 * atendeu. São só duas contagens, porque rodam em TODA tela do painel.
 */
export async function contagensDoPainel(): Promise<{ pedidosPendentes: number; encomendasNovas: number }> {
  const db = await getDb();
  const [pedidos] = await db.select({ n: count() }).from(orders).where(eq(orders.status, "pendente"));
  const [encomendas] = await db.select({ n: count() }).from(customOrders).where(eq(customOrders.status, "novo"));
  return { pedidosPendentes: pedidos.n, encomendasNovas: encomendas.n };
}

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

  // Os "dias" e "meses" do dono são os de São Paulo, não os do servidor (que pode estar em outro fuso).
  const inicioDoDia = sql`date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`;
  const inicioDoMes = sql`date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`;

  // Pedidos feitos hoje.
  const [hoje] = await db.select({ n: count() }).from(orders).where(gte(orders.createdAt, inicioDoDia));
  // Faturamento do mês: só pedidos que o cliente PAGOU (pago, enviado ou entregue), feitos neste mês.
  const [mes] = await db
    .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`, pedidos: count() })
    .from(orders)
    .where(and(inArray(orders.status, ["pago", "enviado", "entregue"]), gte(orders.createdAt, inicioDoMes)));
  // Pagamentos que pedem a atenção do dono: aprovado em pedido CANCELADO (o cliente pagou e não vai receber)
  // ou aprovado com valor DIFERENTE do total num pedido ainda pendente. Cada pedido conta uma vez.
  const [conferir] = await db
    .select({ n: sql<number>`count(distinct ${orders.id})::int` })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.status, "aprovado"),
        sql`(${orders.status} = 'cancelado' or (${orders.status} = 'pendente' and ${payments.amountCents} is distinct from ${orders.totalCents}))`,
      ),
    );
  // Clientes ativos (sem contar administradores nem contas excluídas).
  const [clientes] = await db
    .select({ n: count() })
    .from(customers)
    .where(and(eq(customers.role, "cliente"), isNull(customers.anonymizedAt)));

  // Quantidade de um status (0 se nenhum pedido está nele).
  const n = (s: OrderStatus) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    pendentes: n("pendente"),
    pagos: n("pago"),
    enviados: n("enviado"),
    novasEncomendas: novas.n,
    pedidosHoje: hoje.n,
    faturamentoMesCents: mes.total,
    // Fechamento do mês: quantos pedidos foram pagos e quanto cada um rendeu, em média (0 se nenhum, sem dividir por zero).
    pedidosPagosMes: mes.pedidos,
    ticketMedioCents: mes.pedidos > 0 ? Math.round(mes.total / mes.pedidos) : 0,
    pagamentosParaConferir: conferir.n,
    totalClientes: clientes.n,
    lowStock,
    latest,
  };
}
