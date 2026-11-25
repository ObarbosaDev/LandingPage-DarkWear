// ============================================================================
// Pedidos vistos pelo DONO: listar e mudar o status.
//
// Quem usa: a tela /admin/pedidos, o resumo /admin e a ação changeOrderStatusAction
// (src/app/admin/actions.ts). A criação do pedido (cliente) fica em src/server/orders.ts.
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { and, asc, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, orderItems, orders, orderStatusHistory, payments, ORDER_STATUS, type OrderStatus, type PaymentStatus, type StatusOrigin } from "@/server/db/schema";
import { padraoContem } from "@/server/admin/customers";
import { addressFromOrder, type Address } from "@/server/customers/address";
import { cancelInTx, orderNumber } from "@/server/orders";
import { normalizarRastreio } from "@/lib/tracking";

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
  /** Para onde entregar: a cópia do endereço guardada NO PEDIDO (null nos pedidos antigos e nos sem endereço). */
  entrega: Address | null;
  /** Código de rastreio informado no envio (null = sem código). */
  trackingCode: string | null;
  /** Cada mudança de status do pedido, da mais antiga para a mais recente. */
  history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; origin: StatusOrigin; actor: string | null; at: Date }[];
  /** Pagamentos online do pedido (Mercado Pago), do mais antigo ao mais recente. Vazio = pedido fechado pelo WhatsApp. */
  payments: { status: PaymentStatus; method: string | null; installments: number | null; amountCents: number | null; paidAt: Date | null; createdAt: Date }[];
  /**
   * Pagamento aprovado que NÃO levou o pedido a "pago" e que o dono precisa resolver:
   * "cancelado" (pagou depois de o pedido expirar), "valor" (valor diferente do total) ou "metodo" (pagou por cartão
   * um pedido que teve desconto de Pix).
   * null = nada a resolver.
   */
  alerta: "cancelado" | "valor" | "metodo" | null;
  /** Descontos do pedido: o cupom usado e quanto cada desconto tirou, em centavos (0 = nenhum). */
  desconto: { cupom: string | null; cupomCents: number; pixCents: number };
};

/**
 * Decide se um pedido tem um pagamento aprovado que exige a atenção do dono (ver AdminOrder.alerta).
 * Pedido cancelado com pagamento aprovado: o cliente pagou e não vai receber, é preciso estornar ou
 * reativar à mão. Pedido ainda pendente com pagamento aprovado: o valor não bateu com o total.
 */
export function alertaDePagamento(status: OrderStatus, totalCents: number, pagamentos: AdminOrder["payments"], pixDescontoCents = 0): AdminOrder["alerta"] {
  const aprovados = pagamentos.filter((p) => p.status === "aprovado");
  if (aprovados.length === 0) return null;
  if (status === "cancelado") return "cancelado";
  if (status === "pendente" && aprovados.some((p) => p.amountCents !== totalCents)) return "valor";
  // O desconto de Pix só vale para quem pagou por Pix: o pedido não foi marcado como pago (ver applyPayment).
  if (status === "pendente" && pixDescontoCents > 0 && aprovados.some((p) => p.method !== "bank_transfer")) return "metodo";
  return null;
}

/** As condições de busca de pedidos (status, texto digitado e "tem pagamento aprovado"), iguais na lista e nos totais. */
function condicoesDePedidos(status: OrderStatus | undefined, busca: string | undefined, comPagamentoAprovado: boolean): SQL[] {
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
  if (comPagamentoAprovado) {
    condicoes.push(exists(sql`(select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} = 'aprovado')`));
  }
  return condicoes;
}

/** Quantos pedidos e quanto dinheiro há em cada status, para a mesma busca (conta TODOS, não só os que aparecem). */
async function resumoPorStatus(busca: string | undefined, comPagamentoAprovado: boolean): Promise<Record<OrderStatus, { pedidos: number; somaCents: number }>> {
  const db = await getDb();
  const condicoes = condicoesDePedidos(undefined, busca, comPagamentoAprovado);
  const linhas = await db
    .select({ status: orders.status, pedidos: sql<number>`count(*)::int`, soma: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .groupBy(orders.status);
  const r = Object.fromEntries(ORDER_STATUS.map((s) => [s, { pedidos: 0, somaCents: 0 }])) as Record<OrderStatus, { pedidos: number; somaCents: number }>;
  for (const l of linhas) r[l.status] = { pedidos: l.pedidos, somaCents: l.soma };
  return r;
}

/** Quantos pedidos EM ABERTO (pendente, pago, enviado) cada coluna da esteira mostra no máximo. */
export const LIMITE_ABERTOS = 100;
/** Quantos entregues e cancelados a visão geral mostra (os mais recentes). Para ver os outros, abre-se a coluna. */
export const LIMITE_ENCERRADOS = 20;
/** Quantos pedidos por página quando uma coluna é aberta sozinha. */
export const POR_PAGINA = 40;

/** Uma coluna da esteira já carregada. */
export type ColunaDaEsteira = {
  status: OrderStatus;
  pedidos: AdminOrder[];
  /** Quantos pedidos existem nesta coluna (todos, não só os mostrados). */
  total: number;
  somaCents: number;
  /** Há pedidos além dos mostrados (a tela avisa e oferece o resto). */
  temMais: boolean;
};

/**
 * Carrega a esteira de /admin/pedidos, coluna por coluna.
 *
 * Por que por coluna: carregar "os 200 mais recentes de tudo" fazia um pedido pendente ou pago ANTIGO sumir do quadro
 * quando havia muitos pedidos novos já encerrados. Aqui cada status tem a sua consulta: os pedidos em aberto aparecem
 * (até LIMITE_ABERTOS), os encerrados mostram só os mais recentes, e os totais de cada coluna contam todos os pedidos.
 *
 * @param filtro    abre UMA coluna só, com paginação (POR_PAGINA por página)
 * @param pagina    a página da coluna aberta (1 em diante; valor inválido vira 1)
 * @param busca     o texto da busca (vale para as colunas e para os totais)
 * @param soConferir só os pedidos com pagamento aprovado que NÃO ficaram pagos (o alerta do painel)
 */
export async function carregarEsteira(o: { filtro?: OrderStatus; pagina?: number; busca?: string; soConferir?: boolean }): Promise<{ colunas: ColunaDaEsteira[]; pagina: number }> {
  const conferir = o.soConferir === true;
  const pagina = Number.isInteger(o.pagina) && (o.pagina as number) >= 1 ? (o.pagina as number) : 1;
  const status = o.filtro ? [o.filtro] : ORDER_STATUS;
  const resumo = await resumoPorStatus(o.busca, conferir);

  const colunas = await Promise.all(
    status.map(async (s): Promise<ColunaDaEsteira> => {
      const aberto = s === "pendente" || s === "pago" || s === "enviado";
      const limite = o.filtro ? POR_PAGINA : aberto ? LIMITE_ABERTOS : LIMITE_ENCERRADOS;
      const offset = o.filtro ? (pagina - 1) * POR_PAGINA : 0;
      let pedidos = await listOrders(s, limite, o.busca, { offset, comPagamentoAprovado: conferir });
      let total = resumo[s].pedidos;
      let somaCents = resumo[s].somaCents;
      if (conferir) {
        // Pagamento aprovado nem sempre é um problema (pedido já pago): só ficam os que têm alerta.
        pedidos = pedidos.filter((p) => p.alerta);
        total = pedidos.length;
        somaCents = pedidos.reduce((n, p) => n + p.totalCents, 0);
      }
      return { status: s, pedidos, total, somaCents, temMais: offset + pedidos.length < total };
    }),
  );
  return { colunas, pagina };
}

/**
 * Lista os pedidos, do mais novo para o mais antigo.
 *
 * @param status se informado, só os pedidos desse status (filtro da tela)
 * @param limit  máximo de pedidos devolvidos
 * @param busca  texto digitado na busca: acha pelo NÚMERO do pedido (DW-00012, 00012 ou 12) ou por parte do
 *               nome ou do e-mail do cliente. É tratado como texto, nunca como curinga nem como SQL.
 * @param opcoes.offset                quantos pedidos pular (paginação)
 * @param opcoes.comPagamentoAprovado  só pedidos que têm algum pagamento aprovado (a conferência do painel)
 */
export async function listOrders(
  status?: OrderStatus,
  limit = 100,
  busca?: string,
  opcoes: { offset?: number; comPagamentoAprovado?: boolean } = {},
): Promise<AdminOrder[]> {
  const db = await getDb();
  // Limite e deslocamento vêm de fora: valores estranhos viram valores seguros (nunca erro nem consulta enorme).
  const max = Number.isInteger(limit) ? Math.min(limit, 500) : 100;
  if (max <= 0) return [];
  const offset = Number.isInteger(opcoes.offset) && (opcoes.offset as number) > 0 ? (opcoes.offset as number) : 0;
  const condicoes = condicoesDePedidos(status, busca, opcoes.comPagamentoAprovado === true);

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
    .offset(offset)
    .limit(max);
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
      entrega: addressFromOrder(o),
      trackingCode: o.trackingCode,
      history: historico
        .filter((h) => h.orderId === o.id)
        .map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, origin: h.origin, actor: h.actor, at: h.at })),
      payments: meus,
      alerta: alertaDePagamento(o.status, o.totalCents, meus, o.pixDiscountCents),
      desconto: { cupom: o.couponCode, cupomCents: o.couponDiscountCents, pixCents: o.pixDiscountCents },
    };
  });
}

/**
 * Resultado de uma mudança de status: deu certo, não é permitida, o pedido não existe, ou o código de
 * rastreio informado não tem formato válido (nesse caso nada foi mudado).
 */
export type StatusResult = "ok" | "invalido" | "nao-encontrado" | "rastreio-invalido";

/**
 * Muda o status de um pedido, obedecendo o fluxo de NEXT_STATUS.
 * Cancelar também devolve as peças ao estoque.
 * Devolve "invalido" quando a mudança não é permitida OU quando outra pessoa mudou o pedido
 * no meio do caminho (a tela então avisa o dono).
 *
 * @param opcoes.tracking código de rastreio, lido SÓ ao marcar como "enviado" (vazio = sem código; nas outras
 *                        mudanças é ignorado). Código fora do formato recusa a mudança inteira.
 * @param opcoes.actor    e-mail do administrador que está mudando (gravado no histórico do pedido)
 */
export async function updateOrderStatus(id: number, next: OrderStatus, opcoes: { tracking?: string; actor?: string } = {}): Promise<StatusResult> {
  if (!ORDER_STATUS.includes(next)) return "invalido";
  // O código só vale no envio. Digitou e é inválido? Recusa antes de tocar no pedido.
  let codigo: string | null = null;
  if (next === "enviado" && opcoes.tracking?.trim()) {
    codigo = normalizarRastreio(opcoes.tracking);
    if (!codigo) return "rastreio-invalido";
  }
  const db = await getDb();

  // Tudo numa transação, com a linha do pedido TRAVADA: se duas pessoas clicam ao mesmo tempo, a
  // segunda espera a primeira terminar, enxerga o status novo e é recusada ("invalido").
  return db.transaction(async (tx): Promise<StatusResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!o) return "nao-encontrado";
    // Confere se o fluxo permite ir do status atual para o pedido (ex.: não pula de pendente a enviado).
    if (!NEXT_STATUS[o.status].includes(next)) return "invalido";

    // Cancelar devolve as peças ao estoque, na mesma transação.
    if (next === "cancelado") return (await cancelInTx(tx, id, undefined, "painel", opcoes.actor)) ? "ok" : "invalido";

    await tx
      .update(orders)
      .set({ status: next, updatedAt: new Date(), ...(codigo ? { trackingCode: codigo } : {}) })
      .where(eq(orders.id, id));
    await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: o.status, toStatus: next, origin: "painel", actor: opcoes.actor ?? null });
    return "ok";
  });
}

/**
 * Informa, troca ou apaga (texto vazio) o código de rastreio de um pedido JÁ enviado ou entregue.
 * Serve para corrigir um código digitado errado ou para informar um que o dono não tinha na hora do envio.
 * Pedido que ainda não saiu não tem código ("invalido"); código fora do formato é "rastreio-invalido".
 */
export async function setTrackingCode(id: number, bruto: string): Promise<StatusResult> {
  const texto = bruto.trim();
  const codigo = texto ? normalizarRastreio(texto) : null;
  if (texto && !codigo) return "rastreio-invalido";
  const db = await getDb();
  return db.transaction(async (tx): Promise<StatusResult> => {
    const [o] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, id)).for("update");
    if (!o) return "nao-encontrado";
    if (o.status !== "enviado" && o.status !== "entregue") return "invalido";
    await tx.update(orders).set({ trackingCode: codigo, updatedAt: new Date() }).where(eq(orders.id, id));
    return "ok";
  });
}
