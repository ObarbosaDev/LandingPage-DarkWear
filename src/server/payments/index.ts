// ============================================================================
// Pagamento online dos pedidos: abrir a cobrança e aplicar o resultado ao pedido.
//
// Quem usa:
//   - POST /api/orders (src/app/api/orders/route.ts) → startPayment, quando o cliente escolhe pagar
//     com cartão ou Pix em /carrinho;
//   - POST /api/webhooks/mercadopago → applyPayment, quando o Mercado Pago avisa de um pagamento;
//   - a tela /pagamento/retorno → getPaymentView, para mostrar a situação real do pedido.
// A conversa com a API do Mercado Pago em si fica em ./mercadopago.ts.
//
// Princípios:
//   1. Quem manda é o BANCO, nunca a URL: voltar de uma página de pagamento com "?status=approved"
//      não paga nada. O pedido só vira "pago" quando o servidor consulta o Mercado Pago e confirma.
//   2. O valor pago precisa ser IGUAL ao total do pedido (em centavos) para o pedido ser marcado pago.
//   3. Avisos repetidos (o Mercado Pago reenvia) não fazem mal: o resultado é o mesmo.
// ============================================================================

import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderItems, orders, orderStatusHistory, payments, type OrderStatus, type PaymentStatus } from "@/server/db/schema";
import { orderNumber } from "@/server/orders";
import { PagamentoError, buscarPagamento, criarPreferencia } from "@/server/payments/mercadopago";

/**
 * Endereço público do site (SITE_URL), sem barra no fim. É para onde o Mercado Pago manda o cliente
 * de volta e o aviso de pagamento. Sem SITE_URL, usa o endereço local (só serve para testar a tela).
 */
export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Abre a cobrança de um pedido que ainda está pendente e devolve o endereço da página de pagamento.
 * Registra uma linha "iniciado" em payments (o histórico das tentativas).
 *
 * @throws PagamentoError se o pedido não existe, não está pendente ou o Mercado Pago falhou
 */
export async function startPayment(orderId: number): Promise<string> {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new PagamentoError("Pedido não encontrado.");
  if (o.status !== "pendente") throw new PagamentoError("Só um pedido pendente pode ser pago.");

  const itens = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const { id, url } = await criarPreferencia({
    pedidoId: o.id,
    numero: orderNumber(o.id),
    // O nome mostrado na página do Mercado Pago inclui tamanho e cor, para o cliente conferir.
    itens: itens.map((i) => ({ nome: `${i.name} (${i.color}, ${i.size})`, qty: i.qty, precoCents: i.unitPriceCents })),
    baseUrl: siteUrl(),
  });

  await db.insert(payments).values({
    orderId: o.id,
    provider: "mercadopago",
    preferenceId: id,
    status: "iniciado",
    amountCents: o.totalCents,
  });
  return url;
}

/**
 * O que aconteceu ao aplicar um pagamento:
 *   - "pago": o pedido estava pendente e agora está pago;
 *   - "registrado": o pagamento foi anotado, mas o pedido não mudou (ainda pendente de aprovação,
 *     recusado, ou o pedido já estava pago/enviado);
 *   - "valor-divergente": aprovado, mas o valor NÃO é o do pedido: o pedido NÃO é marcado como pago
 *     e o dono precisa olhar (alguém tentou pagar menos, ou o preço mudou no meio do caminho);
 *   - "pedido-cancelado": aprovado, mas o pedido já tinha sido cancelado (por prazo, por exemplo) e
 *     as peças voltaram ao estoque: o dono precisa decidir entre reativar à mão ou estornar;
 *   - "pedido-desconhecido": o pagamento não aponta para nenhum pedido nosso.
 */
export type ApplyResult = "pago" | "registrado" | "valor-divergente" | "pedido-cancelado" | "pedido-desconhecido";

/**
 * Consulta o pagamento no Mercado Pago e aplica o resultado ao pedido, numa transação.
 *
 * A linha do pedido é TRAVADA (FOR UPDATE) antes de decidir: dois avisos do mesmo pagamento
 * chegando juntos são atendidos um depois do outro, e o segundo já enxerga o pedido pago.
 * O pagamento é guardado por provider_payment_id (único), então repetir não duplica nada.
 */
export async function applyPayment(providerPaymentId: string): Promise<ApplyResult> {
  // Fonte da verdade: a resposta do Mercado Pago ao nosso token, não o que o aviso trouxe.
  const mp = await buscarPagamento(providerPaymentId);

  const orderId = Number(mp.externalReference);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return "pedido-desconhecido";

  const db = await getDb();
  return db.transaction(async (tx): Promise<ApplyResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) return "pedido-desconhecido";

    // Anota o pagamento (cria, ou atualiza se este aviso já tinha chegado antes).
    const dados = {
      status: mp.status,
      method: mp.metodo,
      installments: mp.parcelas,
      amountCents: mp.valorCents,
      paidAt: mp.status === "aprovado" ? (mp.aprovadoEm ?? new Date()) : null,
      updatedAt: new Date(),
    };
    await tx
      .insert(payments)
      .values({ orderId, provider: "mercadopago", providerPaymentId: mp.id, ...dados })
      .onConflictDoUpdate({ target: payments.providerPaymentId, set: dados });

    // Só "aprovado" mexe no pedido.
    if (mp.status !== "aprovado") return "registrado";
    if (o.status === "cancelado") return "pedido-cancelado";
    if (mp.valorCents !== o.totalCents) return "valor-divergente";
    if (o.status !== "pendente") return "registrado"; // já pago (ou adiante): nada a fazer

    await tx.update(orders).set({ status: "pago", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: "pendente", toStatus: "pago", origin: "pagamento" });
    return "pago";
  });
}

/** O que a tela de retorno mostra: só a situação, nada de itens nem valores. */
export type PaymentView = { number: string; status: OrderStatus; payment: PaymentStatus | null };

/**
 * Situação de um pedido DO CLIENTE pelo número mostrado ("DW-00042"), ou null se o número é inválido,
 * não existe ou é de OUTRO cliente (os três casos são idênticos para quem olha). Devolve só o necessário
 * (status), para o endereço não revelar dados do pedido.
 */
export async function getPaymentView(number: string, customerId: number): Promise<PaymentView | null> {
  if (typeof number !== "string" || !Number.isSafeInteger(customerId) || customerId < 1) return null;
  const m = /^DW-(\d{5,9})$/.exec(number);
  if (!m) return null;
  const id = Number(m[1]);
  const db = await getDb();
  // O filtro por dono faz parte da MESMA consulta que acha o pedido.
  const [o] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.id, id), eq(orders.customerId, customerId)));
  if (!o) return null;
  // O pagamento mais recente decide a mensagem (ex.: "recusado" deixa o cliente tentar de novo).
  const [p] = await db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.id)).limit(1);
  return { number: orderNumber(o.id), status: o.status, payment: p?.status ?? null };
}
