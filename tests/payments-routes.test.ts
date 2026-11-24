// ============================================================================
// Testes das ROTAS do pagamento online:
//   - POST /api/webhooks/mercadopago (o aviso do Mercado Pago);
//   - POST /api/orders com "payment": "online" (abrir a cobrança ao fechar a sacola);
//   - GET /api/payments/config (o botão "Pagar com cartão ou Pix" aparece?).
// O Mercado Pago de verdade NUNCA é chamado: o fetch é substituído.
// ============================================================================

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orders, payments, products, rateLimits } from "@/server/db/schema";
import { POST as webhook } from "@/app/api/webhooks/mercadopago/route";
import { POST as criarPedido } from "@/app/api/orders/route";
import { GET as config } from "@/app/api/payments/config/route";
import { createOrder } from "@/server/orders";
import { startCustomerSession } from "@/server/customers/session";
import { clienteDeTeste, resetDb } from "./helpers/db";

// Fora de uma requisição real do Next, estas duas funções não existem: viram "não fazem nada".
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
// connection() (que marca a rota como dinâmica) só funciona dentro de uma requisição real.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
// O "navegador" de mentira: um pote de cookies (para a sessão do cliente) e os cabeçalhos da origem.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "10.0.0.1" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (o: { name: string }) => void jar.delete(o.name),
  }),
}));

const SEGREDO = "segredo-do-webhook";

/** Substitui o fetch: responde a preferência e/ou o pagamento conforme o endereço chamado. */
function fakeMP(o: { pagamento?: Record<string, unknown>; preferenciaOk?: boolean; pagamentoStatus?: number } = {}) {
  const spy = vi.fn(async (url: string) => {
    if (url.includes("/checkout/preferences")) {
      return o.preferenciaOk === false
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ id: "pref-1", init_point: "https://mp/pagar" }) };
    }
    return { ok: (o.pagamentoStatus ?? 200) < 400, status: o.pagamentoStatus ?? 200, json: async () => o.pagamento ?? {} };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const pagamentoMP = (ref: string | number, o: Record<string, unknown> = {}) => ({
  id: 777,
  status: "approved",
  external_reference: String(ref),
  transaction_amount: 89.9,
  payment_type_id: "debit_card",
  installments: 1,
  date_approved: "2026-11-19T12:00:00.000-03:00",
  ...o,
});

/** Assinatura correta do aviso (a mesma conta que o Mercado Pago faz). */
const assinatura = (dataId: string, requestId = "req-1", ts = "1704908010") =>
  `ts=${ts},v1=${createHmac("sha256", SEGREDO).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex")}`;

/** Monta a chamada que o Mercado Pago faz ao nosso endereço. */
function aviso(o: { query?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new Request(`http://x/api/webhooks/mercadopago${o.query ?? ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...o.headers },
    body: JSON.stringify(o.body ?? {}),
  });
}

const statusDe = async (id: number) => (await (await getDb()).select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0].s;
const estoque = async () => (await (await getDb()).select({ s: products.stock }).from(products).where(eq(products.slug, "oversized-gt3-rs")))[0].s;
const itens = [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }];

// O cliente que está logado nos testes (comprar exige conta).
let dono = 0;

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(payments);
  await (await getDb()).delete(rateLimits); // o limite de pedidos por origem não pode acumular entre testes
  jar.clear();
  dono = await clienteDeTeste();
  await startCustomerSession(dono, 1);
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
});

describe("GET /api/payments/config", () => {
  it("diz se o pagamento online está ligado, sem revelar a configuração", async () => {
    const ligado = await config();
    expect(await ligado.json()).toEqual({ online: true });
    expect(ligado.headers.get("cache-control")).toBe("no-store");
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    expect(await (await config()).json()).toEqual({ online: false });
  });
});

describe("POST /api/webhooks/mercadopago", () => {
  it("aviso de pagamento aprovado marca o pedido como pago", async () => {
    const o = await createOrder(itens, await clienteDeTeste());
    fakeMP({ pagamento: pagamentoMP(o.id) });
    const res = await webhook(aviso({ query: "?data.id=777&type=payment" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, resultado: "pago" });
    expect(await statusDe(o.id)).toBe("pago");
  });

  it("aceita o número também pelo corpo JSON, e reentregas não fazem mal", async () => {
    const o = await createOrder(itens, await clienteDeTeste());
    fakeMP({ pagamento: pagamentoMP(o.id) });
    const corpo = { type: "payment", data: { id: 777 } };
    expect((await (await webhook(aviso({ body: corpo }))).json()).resultado).toBe("pago");
    expect((await (await webhook(aviso({ body: corpo }))).json()).resultado).toBe("registrado");
    expect(await statusDe(o.id)).toBe("pago");
  });

  it("sem Mercado Pago configurado responde 503 e não faz nada", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const spy = fakeMP();
    expect((await webhook(aviso({ query: "?data.id=1&type=payment" }))).status).toBe(503);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ["outro tipo de aviso", "?data.id=1&type=merchant_order"],
    ["sem tipo", "?data.id=1"],
    ["sem número", "?type=payment"],
    ["sem nada", ""],
  ])("ignora com 200, sem consultar o Mercado Pago: %s", async (_nome, query) => {
    const spy = fakeMP();
    const res = await webhook(aviso({ query }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(spy).not.toHaveBeenCalled();
  });

  describe("com assinatura (MERCADOPAGO_WEBHOOK_SECRET)", () => {
    beforeEach(() => {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = SEGREDO;
    });

    it("aceita a assinatura correta", async () => {
      const o = await createOrder(itens, await clienteDeTeste());
      fakeMP({ pagamento: pagamentoMP(o.id) });
      const res = await webhook(aviso({ query: "?data.id=777&type=payment", headers: { "x-signature": assinatura("777"), "x-request-id": "req-1" } }));
      expect(res.status).toBe(200);
      expect(await statusDe(o.id)).toBe("pago");
    });

    // Aviso forjado: não consulta o Mercado Pago, não toca no pedido.
    it.each([
      ["sem cabeçalho", {}],
      ["assinatura de outro pagamento", { "x-signature": "__OUTRO__", "x-request-id": "req-1" }],
      ["lixo", { "x-signature": "abc", "x-request-id": "req-1" }],
    ])("recusa com 401: %s", async (_nome, headers) => {
      const o = await createOrder(itens, await clienteDeTeste());
      const spy = fakeMP({ pagamento: pagamentoMP(o.id) });
      const h = { ...headers } as Record<string, string>;
      if (h["x-signature"] === "__OUTRO__") h["x-signature"] = assinatura("888");
      const res = await webhook(aviso({ query: "?data.id=777&type=payment", headers: h }));
      expect(res.status).toBe(401);
      expect(spy).not.toHaveBeenCalled();
      expect(await statusDe(o.id)).toBe("pendente");
    });
  });

  it("pagamento que o Mercado Pago não conhece (404) é ignorado com 200, para ele parar de reenviar", async () => {
    fakeMP({ pagamentoStatus: 404 });
    const res = await webhook(aviso({ query: "?data.id=123456&type=payment" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
  });

  it("id que não é número é ignorado com 200 e nem chega à API", async () => {
    const spy = fakeMP();
    const res = await webhook(aviso({ query: "?data.id=1/../2&type=payment" }));
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it("erro do Mercado Pago ou do banco devolve 500 (para ele reenviar) e não altera o pedido", async () => {
    const o = await createOrder(itens, await clienteDeTeste());
    fakeMP({ pagamentoStatus: 503 });
    const res = await webhook(aviso({ query: "?data.id=777&type=payment" }));
    expect(res.status).toBe(500);
    expect(await statusDe(o.id)).toBe("pendente");
  });

  it("valor diferente: responde 200, NÃO paga e avisa no log", async () => {
    const o = await createOrder(itens, await clienteDeTeste());
    fakeMP({ pagamento: pagamentoMP(o.id, { transaction_amount: 1 }) });
    const res = await webhook(aviso({ query: "?data.id=777&type=payment" }));
    expect((await res.json()).resultado).toBe("valor-divergente");
    expect(await statusDe(o.id)).toBe("pendente");
    expect(console.warn).toHaveBeenCalled();
  });

  it("a resposta de erro não vaza detalhes internos", async () => {
    fakeMP({ pagamentoStatus: 500 });
    const texto = await (await webhook(aviso({ query: "?data.id=777&type=payment" }))).text();
    expect(texto).not.toMatch(/TEST-token|Bearer|stack|at /);
  });
});

describe("POST /api/orders exige login", () => {
  const pedir = (extra: Record<string, unknown> = {}) =>
    criarPedido(new Request("http://x/api/orders", { method: "POST", body: JSON.stringify({ items: itens, ...extra }) }));

  it("sem sessão responde 401, não cria pedido e NÃO baixa o estoque", async () => {
    jar.clear();
    const antes = await estoque();
    const res = await pedir();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/entre na sua conta/i);
    expect(await estoque()).toBe(antes);
    expect(await (await getDb()).select().from(orders)).toHaveLength(0);
  });

  it("o mesmo vale para pagamento online sem sessão (e o Mercado Pago nem é chamado)", async () => {
    jar.clear();
    const spy = fakeMP();
    expect((await pedir({ payment: "online" })).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("cookie vencido, adulterado ou de versão antiga também dá 401", async () => {
    jar.set("dw_cliente", "lixo.lixo");
    expect((await pedir()).status).toBe(401);
    jar.clear();
    await startCustomerSession(dono, 99); // versão que não é a da conta
    expect((await pedir()).status).toBe(401);
  });

  it("com sessão, o pedido fica no nome de quem está logado", async () => {
    const res = await pedir();
    expect(res.status).toBe(201);
    const [o] = await (await getDb()).select().from(orders);
    expect(o.customerId).toBe(dono);
  });

  // O dono do pedido vem SÓ da sessão: nada que o navegador mande no corpo pode trocá-lo.
  it("ignora qualquer 'customerId' enviado no corpo", async () => {
    const outro = await clienteDeTeste("outro@teste.com");
    const res = await pedir({ customerId: outro, customer_id: outro, customer: { id: outro } });
    expect(res.status).toBe(201);
    const [o] = await (await getDb()).select().from(orders);
    expect(o.customerId).toBe(dono);
  });
});

describe("POST /api/orders com pagamento online", () => {
  const pedir = (payment?: string) =>
    criarPedido(new Request("http://x/api/orders", { method: "POST", body: JSON.stringify({ items: itens, ...(payment ? { payment } : {}) }) }));

  it("devolve o endereço de pagamento e deixa o pedido pendente, com o estoque reservado", async () => {
    fakeMP();
    const antes = await estoque();
    const res = await pedir("online");
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d.paymentUrl).toBe("https://mp/pagar");
    expect(d.whatsappUrl).toBeUndefined();
    expect(await estoque()).toBe(antes - 1);
    const [p] = await (await getDb()).select().from(payments);
    expect(p).toMatchObject({ status: "iniciado", preferenceId: "pref-1" });
  });

  it("sem 'payment' continua devolvendo o WhatsApp, como antes, sem tocar no Mercado Pago", async () => {
    const spy = fakeMP();
    const d = await (await pedir()).json();
    expect(d.whatsappUrl).toContain("wa.me");
    expect(d.paymentUrl).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("pagamento online sem Mercado Pago configurado: 503 e NENHUM estoque é baixado", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const antes = await estoque();
    const res = await pedir("online");
    expect(res.status).toBe(503);
    expect(await estoque()).toBe(antes);
    expect(await (await getDb()).select().from(orders)).toHaveLength(0);
  });

  // Se a cobrança não abre, o pedido não pode ficar "fantasma" segurando peças.
  it("se o Mercado Pago falha ao abrir a cobrança, o pedido é cancelado e o estoque volta", async () => {
    fakeMP({ preferenciaOk: false });
    const antes = await estoque();
    const res = await pedir("online");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Não foi possível abrir o pagamento/);
    expect(await estoque()).toBe(antes);
    const [o] = await (await getDb()).select().from(orders);
    expect(o.status).toBe("cancelado");
  });

  it("valores desconhecidos em 'payment' são tratados como WhatsApp", async () => {
    const spy = fakeMP();
    for (const v of ["ONLINE", "pix", "1", "true"]) {
      const d = await (await pedir(v)).json();
      expect(d.whatsappUrl, v).toBeDefined();
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
