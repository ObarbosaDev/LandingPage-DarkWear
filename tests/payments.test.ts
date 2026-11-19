// ============================================================================
// Testes do PAGAMENTO ONLINE (Mercado Pago): o cliente da API (src/server/payments/mercadopago.ts)
// e a aplicação do pagamento ao pedido (src/server/payments/index.ts).
//
// Por que testar: aqui dinheiro vira "pedido pago". O que mais importa: só "approved" aprova, o valor
// tem de ser exato, o mesmo aviso repetido ou simultâneo nunca paga duas vezes, e nada de cartão ou
// de token vaza. O Mercado Pago de verdade NUNCA é chamado: a rede (fetch) é substituída.
// ============================================================================

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderStatusHistory, orders, payments, products } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { applyPayment, getPaymentView, startPayment } from "@/server/payments";
import { PagamentoError, assinaturaValida, buscarPagamento, criarPreferencia, traduzirStatus } from "@/server/payments/mercadopago";
import { resetDb } from "./helpers/db";

// ---------- ajudantes ----------

/** Troca o fetch por uma função de mentira e devolve o espião para conferir as chamadas. */
function fakeFetch(resposta: { ok?: boolean; status?: number; json?: unknown }) {
  const spy = vi.fn(async () => ({ ok: resposta.ok ?? true, status: resposta.status ?? 200, json: async () => resposta.json }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Um pagamento "do Mercado Pago" com os campos que o servidor lê. */
const pagamentoMP = (o: Record<string, unknown> = {}) => ({
  id: 555001,
  status: "approved",
  external_reference: "1",
  transaction_amount: 89.9,
  payment_type_id: "credit_card",
  installments: 3,
  date_approved: "2026-11-19T12:00:00.000-03:00",
  ...o,
});

/** Cria um pedido de verdade (1 camiseta de R$ 89,90) e devolve o id dele. */
async function pedido(qty = 1) {
  const o = await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty }]);
  return o;
}

beforeEach(async () => {
  await resetDb();
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token-secreto";
  delete process.env.MERCADOPAGO_SANDBOX;
  delete process.env.MERCADOPAGO_MAX_INSTALLMENTS;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
});

// ---------- tradução de status ----------

describe("traduzirStatus", () => {
  it.each([
    ["approved", "aprovado"],
    ["rejected", "recusado"],
    ["cancelled", "cancelado"],
    ["refunded", "estornado"],
    ["charged_back", "estornado"],
    ["pending", "pendente"],
    ["in_process", "pendente"],
    ["in_mediation", "pendente"],
    ["authorized", "pendente"],
  ])("%s → %s", (bruto, nosso) => {
    expect(traduzirStatus(bruto)).toBe(nosso);
  });

  // Regra de segurança: status desconhecido NUNCA aprova.
  it.each(["", "APPROVED", "approved ", "aprovado", "paid", "success", "ok"])("status desconhecido %j vira pendente", (s) => {
    expect(traduzirStatus(s)).toBe("pendente");
  });
});

// ---------- assinatura do aviso ----------

describe("assinaturaValida", () => {
  const secret = "segredo-do-webhook";
  /** Monta um cabeçalho x-signature correto para os dados informados. */
  const assinar = (dataId: string, requestId: string, ts = "1704908010") =>
    `ts=${ts},v1=${createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex")}`;

  it("aceita a assinatura correta", () => {
    expect(assinaturaValida({ xSignature: assinar("123456", "req-1"), xRequestId: "req-1", dataId: "123456", secret })).toBe(true);
  });

  it("o id é conferido em minúsculas (como o Mercado Pago assina)", () => {
    expect(assinaturaValida({ xSignature: assinar("abc123", "r"), xRequestId: "r", dataId: "ABC123", secret })).toBe(true);
  });

  it("recusa segredo errado, id trocado, request-id trocado e horário trocado", () => {
    const ok = assinar("123456", "req-1");
    expect(assinaturaValida({ xSignature: ok, xRequestId: "req-1", dataId: "123456", secret: "outro" })).toBe(false);
    expect(assinaturaValida({ xSignature: ok, xRequestId: "req-1", dataId: "999999", secret })).toBe(false);
    expect(assinaturaValida({ xSignature: ok, xRequestId: "req-2", dataId: "123456", secret })).toBe(false);
    expect(assinaturaValida({ xSignature: ok.replace("ts=1704908010", "ts=1704908011"), xRequestId: "req-1", dataId: "123456", secret })).toBe(false);
  });

  it.each([null, "", "lixo", "ts=1", "v1=abc", "ts=,v1=", "ts=1,v1=curto"])("recusa cabeçalho %j", (h) => {
    expect(assinaturaValida({ xSignature: h, xRequestId: "r", dataId: "1", secret })).toBe(false);
  });
});

// ---------- criarPreferencia ----------

describe("criarPreferencia", () => {
  const dados = { pedidoId: 7, numero: "DW-00007", itens: [{ nome: "Camisa", qty: 2, precoCents: 8990 }], baseUrl: "https://loja.exemplo" };
  const corpoEnviado = (spy: ReturnType<typeof fakeFetch>) => JSON.parse((spy.mock.calls[0] as unknown as [string, { body: string }])[1].body);

  it("envia o pedido certo e devolve o endereço de pagamento", async () => {
    const spy = fakeFetch({ json: { id: "pref-1", init_point: "https://mp/pagar", sandbox_init_point: "https://mp/teste" } });
    expect(await criarPreferencia(dados)).toEqual({ id: "pref-1", url: "https://mp/pagar" });

    const [url, init] = spy.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer TEST-token-secreto");

    const b = corpoEnviado(spy);
    expect(b.external_reference).toBe("7"); // é assim que o aviso nos diz de qual pedido é
    expect(b.notification_url).toBe("https://loja.exemplo/api/webhooks/mercadopago");
    expect(b.back_urls.success).toBe("https://loja.exemplo/pagamento/retorno?pedido=DW-00007");
    expect(b.items).toEqual([{ title: "Camisa", quantity: 2, currency_id: "BRL", unit_price: 89.9 }]); // centavos → reais
    expect(b.payment_methods.excluded_payment_types).toEqual([{ id: "ticket" }]); // sem boleto
    expect(b.payment_methods.installments).toBe(1); // padrão: à vista
    expect(b.expires).toBe(true);
    expect(b.expiration_date_to).toMatch(/\+00:00$/);
  });

  it.each([
    ["6", 6],
    ["12", 12],
    ["13", 1],
    ["0", 1],
    ["2.5", 1],
    ["abc", 1],
    ["", 1],
  ])("MERCADOPAGO_MAX_INSTALLMENTS=%j → %i parcelas", async (env, esperado) => {
    process.env.MERCADOPAGO_MAX_INSTALLMENTS = env;
    const spy = fakeFetch({ json: { id: "p", init_point: "https://mp/x" } });
    await criarPreferencia(dados);
    expect(corpoEnviado(spy).payment_methods.installments).toBe(esperado);
  });

  it("no modo de teste usa o endereço sandbox", async () => {
    process.env.MERCADOPAGO_SANDBOX = "true";
    fakeFetch({ json: { id: "p", init_point: "https://mp/real", sandbox_init_point: "https://mp/teste" } });
    expect((await criarPreferencia(dados)).url).toBe("https://mp/teste");
  });

  it("falha com mensagem clara se o Mercado Pago não devolve o endereço", async () => {
    fakeFetch({ json: { id: "p" } });
    await expect(criarPreferencia(dados)).rejects.toThrow(/não devolveu o endereço/);
  });

  it("erro do Mercado Pago vira PagamentoError só com o código, sem copiar a resposta nem o token", async () => {
    fakeFetch({ ok: false, status: 401, json: { message: "token TEST-token-secreto inválido, cliente fulano@x.com" } });
    const erro = await criarPreferencia(dados).catch((e) => e);
    expect(erro).toBeInstanceOf(PagamentoError);
    expect(erro.status).toBe(401);
    expect(erro.message).not.toMatch(/TEST-token|fulano/);
  });

  it("falha de rede vira PagamentoError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(criarPreferencia(dados)).rejects.toBeInstanceOf(PagamentoError);
  });

  it("sem token configurado, não tenta falar com ninguém", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const spy = fakeFetch({ json: {} });
    await expect(criarPreferencia(dados)).rejects.toThrow(/não configurado/);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------- buscarPagamento ----------

describe("buscarPagamento", () => {
  it("traduz o pagamento e converte o valor para centavos sem erro de ponto flutuante", async () => {
    fakeFetch({ json: pagamentoMP({ transaction_amount: "89.90" }) });
    expect(await buscarPagamento("555001")).toMatchObject({ id: "555001", status: "aprovado", statusBruto: "approved", externalReference: "1", valorCents: 8990, metodo: "credit_card", parcelas: 3 });
    // 19.99 * 100 em ponto flutuante dá 1998.9999999999998: o arredondamento corrige.
    fakeFetch({ json: pagamentoMP({ transaction_amount: 19.99 }) });
    expect((await buscarPagamento("1")).valorCents).toBe(1999);
  });

  // O id vem de um aviso externo: nada além de dígitos pode virar parte do endereço da API.
  it.each(["", "abc", "1/../2", "1?x=2", "12 34", "-1", "1.5", "1".repeat(21)])("recusa o id %j sem chamar a rede", async (id) => {
    const spy = fakeFetch({ json: pagamentoMP() });
    await expect(buscarPagamento(id)).rejects.toBeInstanceOf(PagamentoError);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------- startPayment ----------

describe("startPayment", () => {
  it("abre a cobrança com os itens do pedido e registra a tentativa", async () => {
    const o = await pedido(2);
    const spy = fakeFetch({ json: { id: "pref-9", init_point: "https://mp/pagar" } });
    expect(await startPayment(o.id)).toBe("https://mp/pagar");

    const b = JSON.parse((spy.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(b.external_reference).toBe(String(o.id));
    expect(b.items).toEqual([{ title: `${o.items[0].name} (Preta, M)`, quantity: 2, currency_id: "BRL", unit_price: 89.9 }]);

    const db = await getDb();
    const [p] = await db.select().from(payments).where(eq(payments.orderId, o.id));
    expect(p).toMatchObject({ status: "iniciado", preferenceId: "pref-9", amountCents: 2 * 8990, providerPaymentId: null });
  });

  it("recusa pedido que não existe ou que não está pendente, sem chamar o Mercado Pago", async () => {
    const spy = fakeFetch({ json: { id: "p", init_point: "https://mp/x" } });
    await expect(startPayment(999999)).rejects.toThrow(/não encontrado/);
    const o = await pedido();
    const db = await getDb();
    await db.update(orders).set({ status: "pago" }).where(eq(orders.id, o.id));
    await expect(startPayment(o.id)).rejects.toThrow(/pendente/);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------- applyPayment ----------

describe("applyPayment", () => {
  const historico = async (id: number) => (await (await getDb()).select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id))).map((h) => `${h.fromStatus}>${h.toStatus}:${h.origin}`);
  const statusDe = async (id: number) => (await (await getDb()).select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0].s;
  const estoque = async () => (await (await getDb()).select({ s: products.stock }).from(products).where(eq(products.slug, "oversized-gt3-rs")))[0].s;

  it("pagamento aprovado e com o valor exato marca o pedido como pago, com histórico", async () => {
    const o = await pedido();
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id) }) });
    expect(await applyPayment("555001")).toBe("pago");

    expect(await statusDe(o.id)).toBe("pago");
    expect(await historico(o.id)).toEqual(["null>pendente:pedido", "pendente>pago:pagamento"]);
    const [p] = await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id));
    expect(p).toMatchObject({ status: "aprovado", providerPaymentId: "555001", method: "credit_card", installments: 3, amountCents: 8990 });
    expect(p.paidAt).toBeInstanceOf(Date);
  });

  it("o mesmo aviso repetido não paga duas vezes nem duplica registros", async () => {
    const o = await pedido();
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id) }) });
    expect(await applyPayment("555001")).toBe("pago");
    expect(await applyPayment("555001")).toBe("registrado");
    expect(await applyPayment("555001")).toBe("registrado");

    expect(await historico(o.id)).toHaveLength(2);
    expect(await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id))).toHaveLength(1);
  });

  it("avisos SIMULTÂNEOS do mesmo pagamento resultam em exatamente um 'pago'", async () => {
    const o = await pedido();
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id) }) });
    const r = await Promise.all(Array.from({ length: 6 }, () => applyPayment("555001")));
    expect(r.filter((x) => x === "pago")).toHaveLength(1);
    expect(r.filter((x) => x === "registrado")).toHaveLength(5);
    expect(await historico(o.id)).toHaveLength(2);
    expect(await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id))).toHaveLength(1);
  });

  it.each(["89.89", "89.91", "0.01", "0", "899", "8.99"])("valor diferente (%s) NÃO marca como pago", async (valor) => {
    const o = await pedido();
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id), transaction_amount: valor }) });
    expect(await applyPayment("555001")).toBe("valor-divergente");
    expect(await statusDe(o.id)).toBe("pendente");
    // O pagamento fica registrado, para o dono ver o que aconteceu.
    expect((await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id)))[0].amountCents).toBe(Math.round(Number(valor) * 100));
  });

  it.each(["pending", "in_process", "rejected", "cancelled", "refunded", "charged_back", "authorized", "qualquer-coisa"])("status %s NÃO marca como pago", async (status) => {
    const o = await pedido();
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id), status }) });
    expect(await applyPayment("555001")).toBe("registrado");
    expect(await statusDe(o.id)).toBe("pendente");
    expect((await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id)))[0].paidAt).toBeNull();
  });

  it("pedido já cancelado (ex.: expirou) NÃO é reativado e o estoque não é mexido", async () => {
    const o = await pedido();
    const db = await getDb();
    const antes = await estoque();
    await db.update(orders).set({ status: "cancelado" }).where(eq(orders.id, o.id));
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id) }) });
    expect(await applyPayment("555001")).toBe("pedido-cancelado");
    expect(await statusDe(o.id)).toBe("cancelado");
    expect(await estoque()).toBe(antes);
    expect((await db.select().from(payments).where(eq(payments.orderId, o.id)))[0].status).toBe("aprovado");
  });

  it("pedido que já avançou (enviado) não volta atrás", async () => {
    const o = await pedido();
    await (await getDb()).update(orders).set({ status: "enviado" }).where(eq(orders.id, o.id));
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id) }) });
    expect(await applyPayment("555001")).toBe("registrado");
    expect(await statusDe(o.id)).toBe("enviado");
  });

  it("pagamento sem pedido nosso (referência ausente, lixo ou inexistente) é desconhecido e não grava nada", async () => {
    for (const ref of [null, "", "abc", "1.5", "-3", "0", "999999", "99999999999999999999"]) {
      fakeFetch({ json: pagamentoMP({ external_reference: ref }) });
      expect(await applyPayment("555001"), String(ref)).toBe("pedido-desconhecido");
    }
    expect(await (await getDb()).select().from(payments)).toHaveLength(0);
  });

  it("o pagamento muda de situação com o tempo: pendente e depois aprovado", async () => {
    const o = await pedido();
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id), status: "pending" }) });
    expect(await applyPayment("555001")).toBe("registrado");
    fakeFetch({ json: pagamentoMP({ external_reference: String(o.id), status: "approved" }) });
    expect(await applyPayment("555001")).toBe("pago");
    expect(await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id))).toHaveLength(1);
  });

  it("um erro do Mercado Pago não altera nada (o aviso será reenviado)", async () => {
    const o = await pedido();
    fakeFetch({ ok: false, status: 500, json: {} });
    await expect(applyPayment("555001")).rejects.toBeInstanceOf(PagamentoError);
    expect(await statusDe(o.id)).toBe("pendente");
  });
});

// ---------- getPaymentView ----------

describe("getPaymentView", () => {
  it("devolve só a situação (status do pedido e do último pagamento)", async () => {
    const o = await pedido();
    expect(await getPaymentView(o.number)).toEqual({ number: o.number, status: "pendente", payment: null });
    const db = await getDb();
    await db.insert(payments).values({ orderId: o.id, provider: "mercadopago", status: "iniciado" });
    await db.insert(payments).values({ orderId: o.id, provider: "mercadopago", providerPaymentId: "9", status: "recusado" });
    expect((await getPaymentView(o.number))?.payment).toBe("recusado"); // o mais recente
    expect(Object.keys((await getPaymentView(o.number))!).sort()).toEqual(["number", "payment", "status"]);
  });

  it.each(["", "DW-1", "DW-0000X", "dw-00001", "1", "DW-00001; DROP TABLE orders", "DW-99999999", " DW-00001", "DW--0001"])("número inválido ou inexistente %j → null", async (n) => {
    expect(await getPaymentView(n)).toBeNull();
  });
});
