// ============================================================================
// Pedidos de peças prontas: criar, cancelar e expirar.
//
// Quem usa:
//   - POST /api/orders (src/app/api/orders/route.ts)  → createOrder, quando o cliente fecha a sacola
//     em /carrinho;
//   - painel /admin/pedidos (via src/server/admin/orders.ts) → cancelOrder;
//   - cron diário /api/cron/expire-orders → expirePendingOrders.
//
// Regra de ouro deste arquivo: o servidor NUNCA confia no que o navegador manda. Preço, nome e
// disponibilidade são lidos do banco; do cliente só aceitamos "qual peça, tamanho, cor e quantidade".
// E o estoque é protegido por transação, para dois clientes nunca comprarem a mesma última peça.
// ============================================================================

import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, type Db } from "@/server/db";
import {
  orderItems,
  orders,
  orderStatusHistory,
  products,
  type OrderStatus,
  type StatusOrigin,
} from "@/server/db/schema";

/** Uma linha do carrinho como o navegador envia: só o que identifica a peça e a quantidade. */
export type OrderItemInput = { slug: string; size: string; color: string; qty: number };

/** O pedido já registrado, na forma devolvida ao resto do sistema (inclui os valores do servidor). */
export type OrderView = {
  id: number;
  number: string; // "DW-00042"
  status: OrderStatus;
  totalCents: number;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
};

/** Número do pedido mostrado ao cliente e ao dono: DW- seguido do id com 5 dígitos (DW-00042). */
export const orderNumber = (id: number) => `DW-${String(id).padStart(5, "0")}`;

/**
 * Erro de regra de negócio com o status HTTP que a rota deve devolver.
 * 422 = dado inválido (padrão); 409 = conflito (ex.: estoque insuficiente).
 * A mensagem é escrita para o cliente ler, então pode ser mostrada na tela.
 */
export class OrderError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

// ---------- Pedido de peças prontas ----------

/**
 * Valida e limpa a lista de itens que veio do navegador.
 * Aceita só o formato esperado e devolve uma lista segura, ou lança OrderError explicando o problema.
 * Isso protege contra carrinho adulterado (quantidade negativa, texto no lugar de número etc.).
 */
function parseItems(input: unknown): OrderItemInput[] {
  if (!Array.isArray(input) || input.length === 0) throw new OrderError("Carrinho vazio.");
  // Limite de linhas: um carrinho absurdamente grande é abuso, não compra.
  if (input.length > 50) throw new OrderError("Carrinho muito grande.");

  // Junta linhas repetidas (mesma peça, tamanho e cor) para o estoque ser conferido pela soma.
  // Sem isso, duas linhas de "2" passariam cada uma num estoque de 3, vendendo 4.
  const merged = new Map<string, OrderItemInput>();
  for (const raw of input) {
    const r = (raw ?? {}) as Partial<OrderItemInput>;
    const qty = r.qty;
    if (typeof r.slug !== "string" || typeof r.size !== "string" || typeof r.color !== "string")
      throw new OrderError("Item inválido no carrinho.");
    // A quantidade precisa ser um número inteiro de verdade (o texto "2" é recusado de propósito).
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new OrderError("Quantidade inválida.");
    const key = `${r.slug}|${r.size}|${r.color}`;
    const prev = merged.get(key);
    if (prev) prev.qty += qty;
    else merged.set(key, { slug: r.slug, size: r.size, color: r.color, qty });
  }
  return [...merged.values()];
}

/**
 * Registra um pedido: valida, baixa o estoque e grava pedido + itens, tudo numa transação.
 * Se QUALQUER item falhar (sem estoque, peça oculta, tamanho inexistente...), nada é gravado e o
 * estoque dos outros itens não é mexido ("tudo ou nada").
 *
 * @param input      itens do carrinho, como vieram do navegador (ainda não confiáveis)
 * @param customerId cliente que está comprando (vem da sessão, nunca do navegador)
 * @throws OrderError com a mensagem a mostrar ao cliente
 */
export async function createOrder(input: unknown, customerId?: number): Promise<OrderView> {
  const lines = parseItems(input);
  const db = await getDb();

  // db.transaction: se algo lançar erro lá dentro, o banco desfaz tudo o que a transação fez.
  return db.transaction(async (tx) => {
    let total = 0;
    const resolved: OrderView["items"] = [];

    // Baixa em ordem alfabética de produto: dois pedidos com os mesmos itens em ordens diferentes
    // travam as linhas na mesma sequência e não entram em deadlock. A ordem original é mantida na resposta.
    const byIndex = lines.map((l, i) => ({ l, i })).sort((a, b) => (a.l.slug < b.l.slug ? -1 : a.l.slug > b.l.slug ? 1 : 0));

    for (const { l, i } of byIndex) {
      // Lê a peça REAL do banco: é de lá que vêm nome, preço e as opções válidas.
      const [p] = await tx.select().from(products).where(eq(products.slug, l.slug));
      if (!p || !p.active) throw new OrderError("Produto indisponível.");
      if (!p.sizes.includes(l.size)) throw new OrderError(`Tamanho inválido para ${p.name}.`);
      if (!p.colors.includes(l.color)) throw new OrderError(`Cor inválida para ${p.name}.`);

      // Baixa o estoque em um único UPDATE condicional: se não houver quantidade, nenhuma linha muda.
      // É isto que impede vender a mesma última peça a dois clientes ao mesmo tempo: a checagem
      // (gte stock >= qty) e a subtração acontecem juntas, no próprio banco, de forma indivisível.
      const updated = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${l.qty}`, updatedAt: new Date() })
        .where(and(eq(products.slug, l.slug), eq(products.active, true), gte(products.stock, l.qty)))
        .returning({ name: products.name, priceCents: products.priceCents });

      // Nenhuma linha atualizada = a condição de estoque falhou. 409 = conflito com o estado atual.
      if (updated.length === 0) throw new OrderError(`Estoque insuficiente para ${p.name}.`, 409);

      // Preço e nome vêm do banco (da linha que acabamos de atualizar), nunca do navegador.
      const { name, priceCents } = updated[0];
      total += priceCents * l.qty;
      // Guardado na posição ORIGINAL do carrinho, para a resposta manter a ordem que o cliente viu.
      resolved[i] = { name, size: l.size, color: l.color, qty: l.qty, unitPriceCents: priceCents };
    }

    // Cabeçalho do pedido. O status nasce "pendente" (padrão da tabela) até o dono confirmar o pagamento.
    const [order] = await tx
      .insert(orders)
      // Quem comprou (nulo só para testes e pedidos antigos; a rota exige login, ver /api/orders).
      .values({ totalCents: total, customerId: customerId ?? null })
      .returning({ id: orders.id, status: orders.status });

    // Primeira linha do histórico: o pedido nasceu (não veio de nenhum status anterior).
    await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: null, toStatus: "pendente", origin: "pedido" });

    // Linhas do pedido, com nome e preço congelados no momento da compra.
    await tx.insert(orderItems).values(
      lines.map((l, i) => ({
        orderId: order.id,
        productSlug: l.slug,
        name: resolved[i].name,
        size: l.size,
        color: l.color,
        qty: l.qty,
        unitPriceCents: resolved[i].unitPriceCents,
      })),
    );

    return { id: order.id, number: orderNumber(order.id), status: order.status, totalCents: total, items: resolved };
  });
}

/** A "transação" aberta pelo banco: o que as funções recebem para trabalhar dentro dela. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Cancela um pedido DENTRO de uma transação já aberta e devolve as peças ao estoque.
 * Existe separada de cancelOrder para o painel poder cancelar na mesma transação em que confere o
 * status (travar a linha numa transação e cancelar em outra deixaria as duas esperando uma à outra).
 *
 * A linha do pedido é TRAVADA ("FOR UPDATE") antes de qualquer decisão: se dois cancelamentos chegam
 * juntos, o segundo espera o primeiro terminar, enxerga o pedido já cancelado e sai sem repor nada.
 *
 * @param somenteSe só cancela se o pedido ainda estiver nesse status (a expiração usa "pendente")
 * @param origem    quem está cancelando, para o histórico
 * @returns true se cancelou agora; false se não havia o que cancelar
 */
export async function cancelInTx(
  tx: Tx,
  id: number,
  somenteSe: OrderStatus | undefined,
  origem: StatusOrigin,
): Promise<boolean> {
  const [atual] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, id)).for("update");
  if (!atual || atual.status === "cancelado") return false;
  if (somenteSe && atual.status !== somenteSe) return false;

  await tx.update(orders).set({ status: "cancelado", updatedAt: new Date() }).where(eq(orders.id, id));
  await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: atual.status, toStatus: "cancelado", origin: origem });

  // Devolve cada peça do pedido ao estoque (soma, em vez de gravar um número fixo).
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
  for (const it of items) {
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${it.qty}`, updatedAt: new Date() })
      .where(eq(products.slug, it.productSlug));
  }
  return true;
}

/**
 * Cancela o pedido e devolve as peças ao estoque (a versão que abre a sua própria transação).
 *
 * @param id        número interno do pedido
 * @param somenteSe se informado, só cancela se o pedido ainda estiver nesse status
 * @param origem    quem cancelou, para o histórico (padrão: o painel do dono)
 * @returns true se cancelou agora; false se não havia o que cancelar (não existe, já cancelado
 *          ou mudou de status)
 */
export async function cancelOrder(id: number, somenteSe?: OrderStatus, origem: StatusOrigin = "painel"): Promise<boolean> {
  const db = await getDb();
  return db.transaction((tx) => cancelInTx(tx, id, somenteSe, origem));
}

/**
 * Cancela os pedidos PENDENTES antigos e devolve as peças à venda.
 * Chamada todo dia pelo cron (/api/cron/expire-orders): sem isso, um pedido que o cliente nunca
 * pagou seguraria as peças no estoque para sempre.
 *
 * @param maxAgeHours idade mínima, em horas, para um pedido pendente expirar (padrão 48)
 * @returns quantos pedidos foram cancelados
 */
// Pedido pendente segura as peças no estoque. Se ninguém fechou depois de `maxAgeHours`, ele é cancelado
// e as peças voltam à venda. Devolve quantos pedidos foram cancelados.
export async function expirePendingOrders(maxAgeHours = 48): Promise<number> {
  const db = await getDb();
  const limite = new Date(Date.now() - maxAgeHours * 3600 * 1000);
  // Candidatos: pendentes criados antes do limite.
  const velhos = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pendente"), lt(orders.createdAt, limite)));

  let cancelados = 0;
  for (const { id } of velhos) {
    // "pendente" como condição: se o dono marcou como pago entre a consulta e agora, não cancela.
    if (await cancelOrder(id, "pendente", "expiracao")) cancelados++;
  }
  return cancelados;
}
