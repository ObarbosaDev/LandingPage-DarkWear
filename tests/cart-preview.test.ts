// ============================================================================
// Testes da PRÉVIA DA SACOLA (POST /api/cart/preview e calcularPrevia): o valor que a sacola mostra tem de ser
// exatamente o que o pedido cobra, sem registrar nada. E o cupom não pode ser testado por quem não tem conta.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/cart/preview/route";
import { createCoupon } from "@/server/coupons";
import { startCustomerSession } from "@/server/customers/session";
import { getDb } from "@/server/db";
import { coupons, orders, rateLimits } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { clienteDeTeste, resetDb, stockOf } from "./helpers/db";

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

const itens = (qty = 1) => [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty }];
const post = (body: unknown) => POST(new Request("http://x/api/cart/preview", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const cupom = (o: Partial<Parameters<typeof createCoupon>[0]> = {}) =>
  createCoupon({ code: "BEMVINDO10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true, ...o });

let dono = 0;
beforeEach(async () => {
  await resetDb();
  const db = await getDb();
  await db.delete(coupons);
  await db.delete(rateLimits);
  jar.clear();
  dono = await clienteDeTeste();
  await startCustomerSession(dono, 1);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PIX_DISCOUNT_PERCENT;
});

describe("a prévia é igual ao pedido de verdade", () => {
  it("com cupom e Pix, os mesmos valores", async () => {
    process.env.PIX_DISCOUNT_PERCENT = "5";
    await cupom();
    const previa = await (await post({ items: itens(2), coupon: "bemvindo10", pix: true })).json();
    const pedido = await createOrder(itens(2), dono, null, { coupon: "bemvindo10", pix: true });
    expect(previa).toEqual({
      subtotalCents: pedido.subtotalCents,
      couponDiscountCents: pedido.couponDiscountCents,
      pixDiscountCents: pedido.pixDiscountCents,
      totalCents: pedido.totalCents,
      couponCode: "BEMVINDO10",
    });
  });

  it("não registra pedido, não baixa estoque e não gasta o cupom", async () => {
    await cupom();
    for (let i = 0; i < 3; i++) expect((await post({ items: itens(3), coupon: "BEMVINDO10" })).status).toBe(200);
    expect(await (await getDb()).select().from(orders)).toHaveLength(0);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
    expect((await (await getDb()).select().from(coupons).where(eq(coupons.code, "BEMVINDO10")))[0].usedCount).toBe(0);
  });

  it("sem cupom nem Pix, só o subtotal", async () => {
    expect(await (await post({ items: itens(2) })).json()).toEqual({ subtotalCents: 17980, couponDiscountCents: 0, pixDiscountCents: 0, totalCents: 17980, couponCode: null });
  });

  it("não deixa o navegador ditar o valor", async () => {
    const j = await (await post({ items: itens(), totalCents: 1, price: 0.01, items2: [] })).json();
    expect(j.totalCents).toBe(8990);
  });
});

describe("erros", () => {
  it("cupom que não vale devolve 422 com o motivo", async () => {
    await cupom({ minOrderCents: 50000 });
    const r = await post({ items: itens(), coupon: "BEMVINDO10" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/R\$\s?500,00/);
    const r2 = await post({ items: itens(), coupon: "NAOEXISTE" });
    expect((await r2.json()).error).toMatch(/não encontrado/i);
  });

  it("cupom já usado pelo cliente é recusado na prévia também", async () => {
    await cupom();
    await createOrder(itens(), dono, null, { coupon: "BEMVINDO10" });
    expect((await (await post({ items: itens(), coupon: "BEMVINDO10" })).json()).error).toMatch(/já usou/i);
  });

  it("Pix com o desconto desligado: 422", async () => {
    expect((await post({ items: itens(), pix: true })).status).toBe(422);
  });

  it("carrinho inválido, JSON quebrado e peça inexistente", async () => {
    expect((await post({ items: [] })).status).toBe(422);
    expect((await post("{quebrado")).status).toBe(400);
    expect((await post({ items: [{ slug: "nao-existe", size: "M", color: "Preta", qty: 1 }] })).status).toBe(422);
    expect((await post({ items: [{ slug: "oversized-gt3-rs", size: "XXG", color: "Preta", qty: 1 }] })).status).toBe(422);
  });
});

describe("proteções", () => {
  it("sem conta não se testa cupom (401)", async () => {
    jar.clear();
    await cupom();
    expect((await post({ items: itens(), coupon: "BEMVINDO10" })).status).toBe(401);
  });

  it("limite por origem: a 31ª prévia em 10 minutos é barrada", async () => {
    for (let i = 0; i < 30; i++) expect((await post({ items: itens() })).status).toBe(200);
    const r = await post({ items: itens() });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
});
