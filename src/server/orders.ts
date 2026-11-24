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
import { and, eq, exists, gte, lt, ne, or, sql } from "drizzle-orm";
import { calcularDescontos, motivoDeRecusa, normalizarCodigoDoCupom } from "@/lib/discounts";
import { PRAZO_ONLINE_HORAS, PRAZO_WHATSAPP_HORAS } from "@/lib/prazos";
import { comoCupom, pixDescontoPercent } from "@/server/coupons";
import { getDb, type Db } from "@/server/db";
import type { Address } from "@/server/customers/address";
import {
  orderItems,
  coupons,
  orders,
  orderStatusHistory,
  payments,
  productStock,
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
  /** O que o cliente PAGA, já com os descontos. */
  totalCents: number;
  /** A soma das peças, antes dos descontos. */
  subtotalCents: number;
  couponDiscountCents: number;
  pixDiscountCents: number;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
};

/** Escolhas do cliente que mudam o valor do pedido (ambas conferidas no servidor). */
export type OrderOptions = {
  /** Código do cupom digitado na sacola (vazio = nenhum). */
  coupon?: string;
  /** O cliente vai pagar por Pix e quer o desconto de Pix (só vale se o dono ligou PIX_DISCOUNT_PERCENT). */
  pix?: boolean;
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
 * @param address    endereço de entrega, copiado da CONTA do cliente pela rota (nunca do navegador). O pedido guarda
 *                   uma CÓPIA: mudar o endereço da conta depois não muda um pedido já feito. Ausente = sem cópia.
 * @param opcoes     cupom e desconto de Pix escolhidos pelo cliente. O desconto é SEMPRE recalculado aqui, com as
 *                   regras do banco; nada que o navegador calcule vale.
 * @throws OrderError com a mensagem a mostrar ao cliente
 */
export async function createOrder(input: unknown, customerId: number, address?: Address | null, opcoes: OrderOptions = {}): Promise<OrderView> {
  try {
    return await registrarPedido(input, customerId, address, opcoes);
  } catch (e) {
    // Faltou estoque (409): pode haver pedidos pendentes VENCIDOS segurando as peças e esperando o cron do dia.
    // Libera esses (só os vencidos, nunca os que ainda estão no prazo) e tenta uma segunda vez.
    if (e instanceof OrderError && e.status === 409 && (await expirePendingOrders()) > 0) {
      return registrarPedido(input, customerId, address, opcoes);
    }
    throw e;
  }
}

/** O percentual do Pix para este pedido; recusa se o dono não ligou o desconto. */
function percentualDoPix(): number {
  const p = pixDescontoPercent();
  if (p === 0) throw new OrderError("O desconto no Pix não está disponível.");
  return p;
}

/**
 * Confere o cupom que o cliente digitou e devolve-o, ou null se não digitou nenhum. Lança OrderError com o motivo
 * quando o cupom não vale (inexistente, inativo, vencido, esgotado, abaixo do mínimo, já usado por este cliente).
 * É a MESMA conferência para o pedido (travar = true: trava a linha do cupom até o fim da transação) e para a
 * prévia da sacola (travar = false), então o que a sacola promete é o que o pedido cobra.
 */
async function conferirCupom(q: Db | Tx, digitado: unknown, subtotal: number, customerId: number, travar: boolean) {
  const texto = typeof digitado === "string" ? digitado.trim() : "";
  if (!texto) return null;
  const codigo = normalizarCodigoDoCupom(texto);
  if (!codigo) throw new OrderError("Cupom inválido.");
  const consulta = q.select().from(coupons).where(eq(coupons.code, codigo));
  const [linha] = travar ? await consulta.for("update") : await consulta;
  if (!linha) throw new OrderError("Cupom não encontrado.");
  const cupom = comoCupom(linha);
  const recusa = motivoDeRecusa(cupom, subtotal);
  if (recusa) throw new OrderError(recusa);
  // Um cliente usa o mesmo cupom uma vez (a conferência de verdade é o índice único do banco; esta dá a mensagem).
  const [jaUsou] = await q
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.couponCode, codigo), ne(orders.status, "cancelado")))
    .limit(1);
  if (jaUsou) throw new OrderError("Você já usou este cupom.");
  return cupom;
}

/** Os valores de um carrinho depois dos descontos, sem registrar nada (a prévia da sacola). */
export type Previa = { subtotalCents: number; couponDiscountCents: number; pixDiscountCents: number; totalCents: number; couponCode: string | null };

/**
 * Calcula quanto o cliente pagaria, SEM criar pedido nem mexer em estoque ou cupom. Usa os preços do banco e a mesma
 * conta e as mesmas regras do pedido; só não confere estoque (isso é na hora de fechar). Pedido real é que vale.
 * @throws OrderError com o motivo (item inválido, cupom que não vale...)
 */
export async function calcularPrevia(input: unknown, customerId: number, opcoes: OrderOptions = {}): Promise<Previa> {
  const lines = parseItems(input);
  const db = await getDb();
  let subtotal = 0;
  for (const l of lines) {
    const [p] = await db.select().from(products).where(eq(products.slug, l.slug));
    if (!p || !p.active) throw new OrderError("Produto indisponível.");
    if (!p.sizes.includes(l.size)) throw new OrderError(`Tamanho inválido para ${p.name}.`);
    if (!p.colors.includes(l.color)) throw new OrderError(`Cor inválida para ${p.name}.`);
    subtotal += p.priceCents * l.qty;
  }
  const cupom = await conferirCupom(db, opcoes.coupon, subtotal, customerId, false);
  const pixPercent = opcoes.pix === true ? percentualDoPix() : 0;
  const d = calcularDescontos({ subtotalCents: subtotal, cupom, pixPercent });
  return { subtotalCents: subtotal, couponDiscountCents: d.couponCents, pixDiscountCents: d.pixCents, totalCents: d.totalCents, couponCode: cupom?.code ?? null };
}

/** Uma tentativa de registrar o pedido (ver createOrder, que tenta de novo depois de liberar pedidos vencidos). */
async function registrarPedido(input: unknown, customerId: number, address: Address | null | undefined, opcoes: OrderOptions): Promise<OrderView> {
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

      // Baixa o estoque DA VARIAÇÃO (tamanho x cor) em um único UPDATE condicional: se não houver a quantidade
      // naquele tamanho e cor, nenhuma linha muda. É isto que impede vender a mesma última peça a dois clientes
      // ao mesmo tempo (a checagem "stock >= qty" e a subtração acontecem juntas, no próprio banco) e também
      // impede vender o M de uma peça que só tem G. O total da peça (products.stock) é atualizado pelo gatilho
      // do banco (migração 0010); o código nunca o grava.
      const baixou = await tx
        .update(productStock)
        .set({ stock: sql`${productStock.stock} - ${l.qty}` })
        .where(
          and(
            eq(productStock.productSlug, l.slug),
            eq(productStock.size, l.size),
            eq(productStock.color, l.color),
            gte(productStock.stock, l.qty),
          ),
        )
        .returning({ stock: productStock.stock });

      // Nenhuma linha atualizada = a condição de estoque falhou. 409 = conflito com o estado atual.
      if (baixou.length === 0) throw new OrderError(`Estoque insuficiente para ${p.name} (tamanho ${l.size}, cor ${l.color}).`, 409);

      // Preço e nome vêm do banco (da peça lida acima), nunca do navegador.
      const { name, priceCents } = p;
      total += priceCents * l.qty;
      // Guardado na posição ORIGINAL do carrinho, para a resposta manter a ordem que o cliente viu.
      resolved[i] = { name, size: l.size, color: l.color, qty: l.qty, unitPriceCents: priceCents };
    }

    // Descontos. O subtotal é a soma das peças; o cupom e o Pix saem dele, com a MESMA conta da prévia da sacola.
    const subtotal = total;
    // Trava a linha do cupom (dois pedidos disputando o último uso são atendidos um depois do outro) e conta o uso.
    const cupom = await conferirCupom(tx, opcoes.coupon, subtotal, customerId, true);
    const cupomUsado = cupom?.code ?? null;
    if (cupom) await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, cupom.code));
    const pixPercent = opcoes.pix === true ? percentualDoPix() : 0;
    const desc = calcularDescontos({ subtotalCents: subtotal, cupom, pixPercent });
    total = desc.totalCents;

    // Cabeçalho do pedido. O status nasce "pendente" (padrão da tabela) até o dono confirmar o pagamento.
    let order: { id: number; status: OrderStatus };
    try {
      [order] = await tx
      .insert(orders)
      // Quem comprou. Obrigatório: comprar exige conta, e o id vem da SESSÃO (ver /api/orders), nunca do navegador.
      .values({
        totalCents: total,
        customerId,
        // A cópia do endereço de entrega (todos os campos ou nenhum: o banco confere).
        shipZip: address?.zip ?? null,
        shipStreet: address?.street ?? null,
        shipNumber: address?.number ?? null,
        shipComplement: address?.complement ?? null,
        shipDistrict: address?.district ?? null,
        shipCity: address?.city ?? null,
        shipState: address?.state ?? null,
        couponCode: cupomUsado,
        couponDiscountCents: desc.couponCents,
        pixDiscountCents: desc.pixCents,
      })
      .returning({ id: orders.id, status: orders.status });
    } catch (e) {
      // O índice único do banco barrou um segundo pedido do mesmo cliente com o mesmo cupom (pedidos simultâneos).
      if (/orders_cupom_por_cliente/.test(String(e) + String((e as { cause?: unknown })?.cause))) throw new OrderError("Você já usou este cupom.");
      throw e;
    }

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

    return {
      id: order.id,
      number: orderNumber(order.id),
      status: order.status,
      totalCents: total,
      subtotalCents: subtotal,
      couponDiscountCents: desc.couponCents,
      pixDiscountCents: desc.pixCents,
      items: resolved,
    };
  });
}

/** Prazo (em horas) dos pedidos combinados pelo WhatsApp: PENDING_ORDER_HOURS, ou 48 se ausente/inválida. */
function prazoWhatsappHoras(): number {
  const h = Number(process.env.PENDING_ORDER_HOURS);
  return Number.isFinite(h) && h > 0 ? h : PRAZO_WHATSAPP_HORAS;
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
 * @param ator      e-mail do administrador, quando o cancelamento vem do painel (vai para o histórico)
 * @returns true se cancelou agora; false se não havia o que cancelar
 */
export async function cancelInTx(
  tx: Tx,
  id: number,
  somenteSe: OrderStatus | undefined,
  origem: StatusOrigin,
  ator?: string,
): Promise<boolean> {
  const [atual] = await tx.select({ status: orders.status, cupom: orders.couponCode }).from(orders).where(eq(orders.id, id)).for("update");
  if (!atual || atual.status === "cancelado") return false;
  if (somenteSe && atual.status !== somenteSe) return false;

  await tx.update(orders).set({ status: "cancelado", updatedAt: new Date() }).where(eq(orders.id, id));
  await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: atual.status, toStatus: "cancelado", origin: origem, actor: ator ?? null });

  // Devolve o uso do cupom (o cliente pode usá-lo de novo e o limite de usos libera uma vaga).
  if (atual.cupom) {
    await tx.update(coupons).set({ usedCount: sql`GREATEST(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.code, atual.cupom));
  }

  // Devolve cada peça do pedido ao estoque DA SUA VARIAÇÃO (soma, em vez de gravar um número fixo). Se o dono
  // tirou aquele tamanho ou cor da peça depois da compra, a variação não existe mais e não há onde devolver.
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
  for (const it of items) {
    await tx
      .update(productStock)
      .set({ stock: sql`${productStock.stock} + ${it.qty}` })
      .where(and(eq(productStock.productSlug, it.productSlug), eq(productStock.size, it.size), eq(productStock.color, it.color)));
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
 * @param whatsappHours idade mínima, em horas, para expirar um pedido SEM cobrança online (padrão: a variável
 *                      PENDING_ORDER_HOURS, ou 48)
 * @param onlineHours   idade mínima para expirar um pedido COM cobrança online iniciada (padrão: PRAZO_ONLINE_HORAS)
 * @returns quantos pedidos foram cancelados
 */
// Pedido pendente segura as peças no estoque. Se ninguém fechou depois de `maxAgeHours`, ele é cancelado
// e as peças voltam à venda. Devolve quantos pedidos foram cancelados.
export async function expirePendingOrders(whatsappHours = prazoWhatsappHoras(), onlineHours = PRAZO_ONLINE_HORAS): Promise<number> {
  const db = await getDb();
  const limiteZap = new Date(Date.now() - whatsappHours * 3600 * 1000);
  const limiteOnline = new Date(Date.now() - onlineHours * 3600 * 1000);
  // Candidatos: pendentes vencidos. O prazo é o do WhatsApp para todos, e o prazo curto vale para quem tem cobrança
  // online (basta existir uma linha em payments: a rota de pedidos a cria junto com a página de pagamento).
  const velhos = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pendente"),
        or(
          lt(orders.createdAt, limiteZap),
          and(lt(orders.createdAt, limiteOnline), exists(db.select({ um: sql`1` }).from(payments).where(eq(payments.orderId, orders.id)))),
        ),
      ),
    );

  let cancelados = 0;
  for (const { id } of velhos) {
    // "pendente" como condição: se o dono marcou como pago entre a consulta e agora, não cancela.
    if (await cancelOrder(id, "pendente", "expiracao")) cancelados++;
  }
  return cancelados;
}
