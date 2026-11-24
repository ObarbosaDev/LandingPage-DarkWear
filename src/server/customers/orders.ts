// ============================================================================
// "MEUS PEDIDOS": os pedidos de UM cliente, vistos por ele mesmo.
//
// Quem usa: as páginas /conta/pedidos (lista) e /conta/pedidos/[numero] (detalhe).
// O painel do dono usa outro módulo (src/server/admin/orders.ts), que enxerga todos os pedidos.
//
// REGRA DE OURO: toda consulta aqui filtra por customer_id NO BANCO. Nunca se busca um pedido só pelo
// número e se compara o dono depois: assim não há caminho em que o pedido de outra pessoa chegue ao
// código. E "pedido de outro cliente" responde exatamente como "pedido que não existe" (null), para
// ninguém descobrir, adivinhando números, quais pedidos existem.
//
// O que NÃO sai daqui: a origem das mudanças de status, o id do pagamento no Mercado Pago, a chave da
// cobrança e o id do cliente. O cliente vê só o que é dele e o que ele precisa saber.
// ============================================================================

import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderItems, orders, orderStatusHistory, payments, type OrderStatus, type PaymentStatus } from "@/server/db/schema";
import { addressFromOrder, type Address } from "@/server/customers/address";
import { orderNumber } from "@/server/orders";

/** Uma linha da lista "Meus pedidos". */
export type CustomerOrder = {
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  /** Total de peças (soma das quantidades). */
  itemCount: number;
};

/** O detalhe de um pedido, para a página do pedido. */
export type CustomerOrderDetail = {
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
  /** Cada mudança de status, da mais antiga para a mais recente. */
  history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; at: Date }[];
  /** Para onde o pedido vai: a cópia do endereço guardada NO PEDIDO (null nos pedidos antigos). */
  entrega: Address | null;
  /** Código de rastreio informado pelo dono no envio (null = ainda não há). */
  trackingCode: string | null;
  /** Pagamentos online do pedido (vazio se foi fechado pelo WhatsApp). */
  payments: { status: PaymentStatus; method: string | null; installments: number | null; amountCents: number | null; paidAt: Date | null; createdAt: Date }[];
};

// Um id de cliente válido: inteiro positivo seguro. Qualquer outra coisa nem chega ao banco.
const idValido = (id: number) => Number.isSafeInteger(id) && id >= 1;

/**
 * Os pedidos de um cliente, do mais novo para o mais antigo (no máximo 100).
 * Cliente inexistente, sem pedidos ou com id inválido recebe lista vazia.
 */
export async function listCustomerOrders(customerId: number): Promise<CustomerOrder[]> {
  if (!idValido(customerId)) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: orders.id, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(100);
  if (rows.length === 0) return [];

  // O total de peças de todos os pedidos da página, numa consulta só (em vez de uma por pedido).
  const contagem = await db
    .select({ orderId: orderItems.orderId, total: sql<number>`sum(${orderItems.qty})::int` })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .groupBy(orderItems.orderId);
  const pecas = new Map(contagem.map((c) => [c.orderId, c.total]));

  return rows.map((o) => ({ number: orderNumber(o.id), status: o.status, totalCents: o.totalCents, createdAt: o.createdAt, itemCount: pecas.get(o.id) ?? 0 }));
}

/**
 * O detalhe de um pedido DO CLIENTE pelo número mostrado ("DW-00042"), ou null.
 * null vale para: número inválido, pedido que não existe, pedido de OUTRO cliente e pedido antigo sem dono.
 * Os quatro casos são idênticos para quem chama (e para quem está olhando a tela).
 */
export async function getCustomerOrder(customerId: number, number: string): Promise<CustomerOrderDetail | null> {
  if (!idValido(customerId) || typeof number !== "string") return null;
  const m = /^DW-(\d{5,9})$/.exec(number);
  if (!m) return null;
  const id = Number(m[1]);

  const db = await getDb();
  // O filtro por dono é parte da MESMA consulta que acha o pedido.
  const [o] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.customerId, customerId)));
  if (!o) return null;

  const [itens, historico, pagamentos] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.at), asc(orderStatusHistory.id)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(asc(payments.createdAt), asc(payments.id)),
  ]);

  return {
    number: orderNumber(o.id),
    status: o.status,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
    entrega: addressFromOrder(o),
    trackingCode: o.trackingCode,
    items: itens.map((i) => ({ name: i.name, size: i.size, color: i.color, qty: i.qty, unitPriceCents: i.unitPriceCents })),
    history: historico.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, at: h.at })),
    payments: pagamentos.map((p) => ({ status: p.status, method: p.method, installments: p.installments, amountCents: p.amountCents, paidAt: p.paidAt, createdAt: p.createdAt })),
  };
}
