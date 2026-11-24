// ============================================================================
// Pedidos vistos pelo DONO: listar e mudar o status.
//
// Quem usa: a tela /admin/pedidos, o resumo /admin e a ação changeOrderStatusAction
// (src/app/admin/actions.ts). A criação do pedido (cliente) fica em src/server/orders.ts.
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, orderItems, orders, orderStatusHistory, payments, ORDER_STATUS, type OrderStatus, type PaymentStatus, type StatusOrigin } from "@/server/db/schema";
import { padraoContem } from "@/server/admin/customers";
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
  /** Quem comprou. null só nos pedidos antigos, feitos antes de existir cadastro. Nunca inclui a senha. */
  customer: { id: number; name: string; email: string; phone: string } | null;
  /** Cada mudança de status do pedido, da mais antiga para a mais recente. */
  history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; origin: StatusOrigin; at: Date }[];
  /** Pagamentos online do pedido (Mercado Pago), do mais antigo ao mais recente. Vazio = pedido fechado pelo WhatsApp. */
  payments: { status: PaymentStatus; method: string | null; installments: number | null; amountCents: number | null; paidAt: Date | null; createdAt: Date }[];
  /**
   * Pagamento aprovado que NÃO levou o pedido a "pago" e que o dono precisa resolver:
   * "cancelado" (pagou depois de o pedido expirar) ou "valor" (valor diferente do total).
   * null = nada a resolver.
   */
  alerta: "cancelado" | "valor" | null;
};

/**
 * Decide se um pedido tem um pagamento aprovado que exige a atenção do dono (ver AdminOrder.alerta).
 * Pedido cancelado com pagamento aprovado: o cliente pagou e não vai receber, é preciso estornar ou
 * reativar à mão. Pedido ainda pendente com pagamento aprovado: o valor não bateu com o total.
 */
export function alertaDePagamento(status: OrderStatus, totalCents: number, pagamentos: AdminOrder["payments"]): AdminOrder["alerta"] {
  const aprovados = pagamentos.filter((p) => p.status === "aprovado");
  if (aprovados.length === 0) return null;
  if (status === "cancelado") return "cancelado";
  if (status === "pendente" && aprovados.some((p) => p.amountCents !== totalCents)) return "valor";
  return null;
}

/**
 * Lista os pedidos, do mais novo para o mais antigo.
 *
 * @param status se informado, só os pedidos desse status (filtro da tela)
 * @param limit  máximo de pedidos devolvidos
 * @param busca  texto digitado na busca: acha pelo NÚMERO do pedido (DW-00012, 00012 ou 12) ou por parte do
 *               nome ou do e-mail do cliente. É tratado como texto, nunca como curinga nem como SQL.
 */
export async function listOrders(status?: OrderStatus, limit = 100, busca?: string): Promise<AdminOrder[]> {
  const db = await getDb();

  const condicoes: SQL[] = [];
  if (status) condicoes.push(eq(orders.status, status));
  const termo = typeof busca === "string" ? busca.trim() : "";
  if (termo) {
    const padrao = padraoContem(termo);
    const achar = [ilike(customers.name, padrao), ilike(customers.email, padrao)];
    // "DW-00012", "dw-12", "00012" e "12" são o mesmo pedido.
    const numero = /^(?:dw-?)?0*(\d{1,9})$/i.exec(termo);
    if (numero) achar.push(eq(orders.id, Number(numero[1])));
    condicoes.push(or(...achar) as SQL);
  }

  const rows = await db
    .select({
      order: orders,
      customer: { id: customers.id, name: customers.name, email: customers.email, phone: customers.phone },
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    // Sem condição = todos os pedidos.
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.order.id);

  // Busca os itens de TODOS os pedidos da página numa consulta só (em vez de uma por pedido),
  // que é bem mais rápida, e depois distribui cada item ao seu pedido.
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, ids));

  // O histórico de status também vem numa consulta só, e é distribuído a cada pedido.
  const historico = await db
    .select()
    .from(orderStatusHistory)
    .where(inArray(orderStatusHistory.orderId, ids))
    .orderBy(asc(orderStatusHistory.at), asc(orderStatusHistory.id));

  // Pagamentos online, também numa consulta só.
  const pagamentos = await db
    .select()
    .from(payments)
    .where(inArray(payments.orderId, ids))
    .orderBy(asc(payments.createdAt), asc(payments.id));

  return rows.map(({ order: o, customer }) => {
    const meus = pagamentos
      .filter((p) => p.orderId === o.id)
      .map((p) => ({ status: p.status, method: p.method, installments: p.installments, amountCents: p.amountCents, paidAt: p.paidAt, createdAt: p.createdAt }));
    return {
      id: o.id,
      number: orderNumber(o.id),
      status: o.status,
      totalCents: o.totalCents,
      createdAt: o.createdAt,
      items: items
        .filter((i) => i.orderId === o.id)
        .map((i) => ({ name: i.name, size: i.size, color: i.color, qty: i.qty, unitPriceCents: i.unitPriceCents })),
      customer: customer && customer.id !== null ? customer : null,
      history: historico
        .filter((h) => h.orderId === o.id)
        .map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, origin: h.origin, at: h.at })),
      payments: meus,
      alerta: alertaDePagamento(o.status, o.totalCents, meus),
    };
  });
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
