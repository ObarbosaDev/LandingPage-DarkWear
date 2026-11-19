// ============================================================================
// Pedidos vistos pelo DONO: listar e mudar o status.
//
// Quem usa: a tela /admin/pedidos, o resumo /admin e a ação changeOrderStatusAction
// (src/app/admin/actions.ts). A criação do pedido (cliente) fica em src/server/orders.ts.
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderItems, orders, orderStatusHistory, ORDER_STATUS, type OrderStatus, type StatusOrigin } from "@/server/db/schema";
import { cancelInTx, orderNumber } from "@/server/orders";

// De cada status, para quais o dono pode mover o pedido.
// Define o fluxo: pendente → pago → enviado → entregue. Só dá para cancelar antes do envio.
// "entregue" e "cancelado" são finais (lista vazia): não há como reabrir um pedido encerrado.
// Esta tabela também decide quais botões a tela /admin/pedidos mostra em cada pedido.
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pendente: ["pago", "cancelado"],
  pago: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: [],
  cancelado: [],
};

/** Um pedido completo (cabeçalho + itens), no formato que a tela de pedidos precisa. */
export type AdminOrder = {
  id: number;
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
  /** Cada mudança de status do pedido, da mais antiga para a mais recente. */
  history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; origin: StatusOrigin; at: Date }[];
};

/**
 * Lista os pedidos, do mais novo para o mais antigo.
 *
 * @param status se informado, só os pedidos desse status (filtro da tela)
 * @param limit  máximo de pedidos devolvidos
 */
export async function listOrders(status?: OrderStatus, limit = 100): Promise<AdminOrder[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(orders)
    // undefined = sem filtro (todos os status).
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  // Busca os itens de TODOS os pedidos da página numa consulta só (em vez de uma por pedido),
  // que é bem mais rápida, e depois distribui cada item ao seu pedido.
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));

  // O histórico de status também vem numa consulta só, e é distribuído a cada pedido.
  const historico = await db
    .select()
    .from(orderStatusHistory)
    .where(inArray(orderStatusHistory.orderId, rows.map((r) => r.id)))
    .orderBy(asc(orderStatusHistory.at), asc(orderStatusHistory.id));

  return rows.map((o) => ({
    id: o.id,
    number: orderNumber(o.id),
    status: o.status,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ name: i.name, size: i.size, color: i.color, qty: i.qty, unitPriceCents: i.unitPriceCents })),
    history: historico
      .filter((h) => h.orderId === o.id)
      .map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, origin: h.origin, at: h.at })),
  }));
}

/** Resultado de uma mudança de status: deu certo, não é permitida, ou o pedido não existe. */
export type StatusResult = "ok" | "invalido" | "nao-encontrado";

/**
 * Muda o status de um pedido, obedecendo o fluxo de NEXT_STATUS.
 * Cancelar também devolve as peças ao estoque.
 * Devolve "invalido" quando a mudança não é permitida OU quando outra pessoa mudou o pedido
 * no meio do caminho (a tela então avisa o dono).
 */
export async function updateOrderStatus(id: number, next: OrderStatus): Promise<StatusResult> {
  if (!ORDER_STATUS.includes(next)) return "invalido";
  const db = await getDb();

  // Tudo numa transação, com a linha do pedido TRAVADA: se duas pessoas clicam ao mesmo tempo, a
  // segunda espera a primeira terminar, enxerga o status novo e é recusada ("invalido").
  return db.transaction(async (tx): Promise<StatusResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!o) return "nao-encontrado";
    // Confere se o fluxo permite ir do status atual para o pedido (ex.: não pula de pendente a enviado).
    if (!NEXT_STATUS[o.status].includes(next)) return "invalido";

    // Cancelar devolve as peças ao estoque, na mesma transação.
    if (next === "cancelado") return (await cancelInTx(tx, id, undefined, "painel")) ? "ok" : "invalido";

    await tx.update(orders).set({ status: next, updatedAt: new Date() }).where(eq(orders.id, id));
    await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: o.status, toStatus: next, origin: "painel" });
    return "ok";
  });
}
