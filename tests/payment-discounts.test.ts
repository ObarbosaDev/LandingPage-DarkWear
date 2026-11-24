// ============================================================================
// Testes dos DESCONTOS no pagamento online e na rota de pedidos:
//   - a cobrança do Mercado Pago tem de bater EXATAMENTE com o total (um item só quando há desconto);
//   - "Pix com desconto" só oferece Pix na página de pagamento E o aviso só paga o pedido se foi por Pix;
//   - a rota aceita cupom e Pix, recusa o que não vale e devolve os valores calculados pelo servidor;
//   - a mensagem do WhatsApp mostra subtotal e descontos.
// O Mercado Pago de verdade NUNCA é chamado: o fetch é substituído.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as criarPedido } from "@/app/api/orders/route";
import { GET as config } from "@/app/api/payments/config/route";
import { buildCartMessage } from "@/lib/whatsapp";
import { alertaDePagamento } from "@/server/admin/orders";
import { createCoupon } from "@/server/coupons";
import { saveAddress } from "@/server/customers/address";
import { startCustomerSession } from "@/server/customers/session";
import { getDb } from "@/server/db";
import { coupons, orders, payments, rateLimits } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { applyPayment, startPayment } from "@/server/payments";
import { clienteDeTeste, resetDb } from "./helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "10.0.0.1" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (o: { name: string }) => void jar.delete(o.name),
  }),
}));

const itens = (qty = 1) => [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty }]; // R$ 89,90 cada

/** Substitui o fetch: responde a preferência (guardando o corpo enviado) e o pagamento. */
function fakeMP(pagamento: Record<string, unknown> = {}) {
  const spy = vi.fn(async (url: string) => {
    if (url.includes("/checkout/preferences")) return { ok: true, status: 200, json: async () => ({ id: "pref-1", init_point: "https://mp/pagar" }) };
    return { ok: true, status: 200, json: async () => pagamento };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
const corpoDaPreferencia = (spy: ReturnType<typeof fakeMP>) => {
  const chamada = spy.mock.calls.find((c) => String((c as unknown[])[0]).includes("/checkout/preferences")) as unknown as [string, { body: string }];
  return JSON.parse(chamada[1].body);
};
const pagamentoMP = (ref: number, o: Record<string, unknown> = {}) => ({
  id: 901,
  status: "approved",
  external_reference: String(ref),
  transaction_amount: 85.41,
  payment_type_id: "bank_transfer",
  installments: 1,
  date_approved: "2026-11-19T12:00:00.000-03:00",
  ...o,
});

let dono = 0;
beforeEach(async () => {
  await resetDb();
  const db = await getDb();
  await db.delete(payments);
  await db.delete(coupons);
  await db.delete(rateLimits);
  jar.clear();
  dono = await clienteDeTeste();
  await saveAddress(dono, { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: null, district: "Bela Vista", city: "São Paulo", state: "SP" });
  await startCustomerSession(dono, 1);
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
  process.env.PIX_DISCOUNT_PERCENT = "5";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.PIX_DISCOUNT_PERCENT;
});

const post = (body: unknown) => criarPedido(new Request("http://x/api/orders", { method: "POST", body: JSON.stringify(body) }));
const cupom10 = () => createCoupon({ code: "BEMVINDO10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true });

describe("a cobrança bate com o total", () => {
  it("sem desconto, um item por peça (como sempre)", async () => {
    const o = await createOrder(itens(2), dono);
    const spy = fakeMP();
    await startPayment(o.id);
    expect(corpoDaPreferencia(spy).items).toEqual([{ title: `${o.items[0].name} (Preta, M)`, quantity: 2, currency_id: "BRL", unit_price: 89.9 }]);
  });

  it("com cupom, um item só, com o valor exato do pedido", async () => {
    await cupom10();
    const o = await createOrder(itens(2), dono, null, { coupon: "BEMVINDO10" }); // 179,80 - 17,98 = 161,82
    const spy = fakeMP();
    await startPayment(o.id);
    const b = corpoDaPreferencia(spy);
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({ quantity: 1, unit_price: 161.82 });
    expect(b.items[0].title).toMatch(/Pedido DW-\d{5}.*2 peças/);
    const soma = b.items.reduce((s: number, i: { quantity: number; unit_price: number }) => s + Math.round(i.unit_price * 100) * i.quantity, 0);
    expect(soma).toBe(o.totalCents);
  });

  it("para Pix com desconto, a página oferece só Pix (todo o resto é excluído)", async () => {
    const o = await createOrder(itens(), dono, null, { pix: true });
    const spy = fakeMP();
    await startPayment(o.id, { somentePix: true });
    const excluidos = corpoDaPreferencia(spy).payment_methods.excluded_payment_types.map((t: { id: string }) => t.id);
    expect(excluidos.sort()).toEqual(["account_money", "atm", "credit_card", "debit_card", "prepaid_card", "ticket"]);
    expect(excluidos).not.toContain("bank_transfer");
  });

  it("sem escolher Pix, só o boleto fica de fora", async () => {
    const o = await createOrder(itens(), dono);
    const spy = fakeMP();
    await startPayment(o.id);
    expect(corpoDaPreferencia(spy).payment_methods.excluded_payment_types).toEqual([{ id: "ticket" }]);
  });
});

describe("o aviso de pagamento e o desconto de Pix", () => {
  it("pago por Pix com o valor certo: o pedido fica pago", async () => {
    const o = await createOrder(itens(), dono, null, { pix: true }); // 85,41
    fakeMP(pagamentoMP(o.id));
    expect(await applyPayment("901")).toBe("pago");
  });

  it("aprovado por CARTÃO num pedido com desconto de Pix: não paga, e o painel alerta", async () => {
    const o = await createOrder(itens(), dono, null, { pix: true });
    fakeMP(pagamentoMP(o.id, { payment_type_id: "credit_card" }));
    expect(await applyPayment("901")).toBe("metodo-divergente");
    const [linha] = await (await getDb()).select().from(orders).where(eq(orders.id, o.id));
    expect(linha.status).toBe("pendente");
    const pags = (await (await getDb()).select().from(payments).where(eq(payments.orderId, o.id))).map((p) => ({ ...p, method: p.method }));
    expect(alertaDePagamento("pendente", o.totalCents, pags as never, o.pixDiscountCents)).toBe("metodo");
  });

  it("pedido SEM desconto de Pix pode ser pago por cartão normalmente", async () => {
    const o = await createOrder(itens(), dono);
    fakeMP(pagamentoMP(o.id, { transaction_amount: 89.9, payment_type_id: "credit_card" }));
    expect(await applyPayment("901")).toBe("pago");
  });

  it("alerta de método não aparece para Pix nem para pedido sem desconto de Pix", () => {
    const p = (method: string) => ({ status: "aprovado" as const, method, installments: 1, amountCents: 8541, paidAt: new Date(), createdAt: new Date() });
    expect(alertaDePagamento("pendente", 8541, [p("bank_transfer")], 449)).toBeNull();
    expect(alertaDePagamento("pendente", 8541, [p("credit_card")], 0)).toBeNull();
    expect(alertaDePagamento("pendente", 8541, [p("credit_card")], 449)).toBe("metodo");
  });
});

describe("POST /api/orders com cupom e Pix", () => {
  it("cupom no pedido pelo WhatsApp: devolve os valores do servidor e a mensagem mostra o desconto", async () => {
    await cupom10();
    const res = await post({ items: itens(2), coupon: "bemvindo10" });
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j).toMatchObject({ subtotalCents: 17980, couponDiscountCents: 1798, pixDiscountCents: 0, totalCents: 16182 });
    const texto = decodeURIComponent(new URL(j.whatsappUrl).searchParams.get("text")!);
    expect(texto).toMatch(/Subtotal: R\$\s?179,80/);
    expect(texto).toMatch(/Cupom BEMVINDO10: -R\$\s?17,98/);
    expect(texto).toMatch(/Total: R\$\s?161,82/);
  });

  it("o total que o navegador diz ou o desconto que ele inventa são ignorados", async () => {
    const res = await post({ items: itens(), totalCents: 1, discountCents: 8000, couponDiscountCents: 8000, pixDiscountCents: 8000 });
    expect((await res.json()).totalCents).toBe(8990);
  });

  it("payment 'pix': cobrança só de Pix, com desconto e total do servidor", async () => {
    const spy = fakeMP();
    const res = await post({ items: itens(), payment: "pix" });
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j).toMatchObject({ paymentUrl: "https://mp/pagar", subtotalCents: 8990, pixDiscountCents: 449, totalCents: 8541 });
    expect(corpoDaPreferencia(spy).items[0].unit_price).toBe(85.41);
    expect(corpoDaPreferencia(spy).payment_methods.excluded_payment_types.map((t: { id: string }) => t.id)).toContain("credit_card");
  });

  it("payment 'pix' com o desconto desligado é recusado e nada é reservado", async () => {
    delete process.env.PIX_DISCOUNT_PERCENT;
    const spy = fakeMP();
    const res = await post({ items: itens(), payment: "pix" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Pix/);
    expect(spy).not.toHaveBeenCalled();
    expect(await (await getDb()).select().from(orders)).toHaveLength(0);
  });

  it("payment 'pix' sem Mercado Pago configurado: 503", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    expect((await post({ items: itens(), payment: "pix" })).status).toBe(503);
  });

  it("cupom inválido devolve o motivo e não cria pedido", async () => {
    const res = await post({ items: itens(), coupon: "NAOEXISTE" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/não encontrado/i);
    expect(await (await getDb()).select().from(orders)).toHaveLength(0);
  });

  it("falha ao abrir o pagamento desfaz o pedido E devolve o uso do cupom", async () => {
    await cupom10();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const res = await post({ items: itens(), coupon: "BEMVINDO10", payment: "online" });
    expect(res.status).toBe(502);
    expect((await (await getDb()).select().from(coupons))[0].usedCount).toBe(0);
  });
});

describe("GET /api/payments/config", () => {
  it("informa o percentual do Pix só quando o pagamento online está ligado", async () => {
    expect(await (await config()).json()).toEqual({ online: true, pixDiscountPercent: 5 });
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    expect(await (await config()).json()).toEqual({ online: false, pixDiscountPercent: 0 });
  });
});

describe("mensagem do WhatsApp", () => {
  const linha = { name: "Camisa", size: "M", color: "Preta", qty: 2, priceCents: 8990 };
  it("sem desconto, a mensagem não muda (nada de linha de subtotal)", () => {
    const m = buildCartMessage([linha]);
    expect(m).not.toMatch(/Subtotal|Cupom|Desconto no Pix/);
    expect(m).toMatch(/Total: R\$\s?179,80/);
  });
  it("com os dois descontos, mostra subtotal, cada um e o total certo", () => {
    const m = buildCartMessage([linha], { couponCode: "BEMVINDO10", couponCents: 1798, pixCents: 809 });
    expect(m).toMatch(/Subtotal: R\$\s?179,80/);
    expect(m).toMatch(/Cupom BEMVINDO10: -R\$\s?17,98/);
    expect(m).toMatch(/Desconto no Pix: -R\$\s?8,09/);
    expect(m).toMatch(/Total: R\$\s?153,73/);
  });
  it("só Pix: o subtotal aparece uma vez", () => {
    const m = buildCartMessage([linha], { pixCents: 899 });
    expect(m.match(/Subtotal/g)).toHaveLength(1);
  });
});
