import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orders } from "@/server/db/schema";
import { createOrder, expirePendingOrders } from "@/server/orders";
import { updateOrderStatus } from "@/server/admin/orders";
import { resetDb, stockOf } from "./helpers/db";

// Fora de uma requisição do Next, o revalidateTag não tem onde atuar: nos testes ele só é observado.
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));

const GT3 = { slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 2 };
const HORA = 3600 * 1000;

beforeEach(async () => {
  await resetDb();
  revalidateTag.mockClear();
  delete process.env.CRON_SECRET;
  delete process.env.PENDING_ORDER_HOURS;
});

async function envelhecer(id: number, horas: number) {
  const db = await getDb();
  await db
    .update(orders)
    .set({ createdAt: new Date(Date.now() - horas * HORA) })
    .where(eq(orders.id, id));
}

async function statusDe(id: number) {
  const [o] = await (await getDb()).select({ s: orders.status }).from(orders).where(eq(orders.id, id));
  return o.s;
}

describe("expirePendingOrders", () => {
  it("cancela pedido pendente antigo e devolve as peças", async () => {
    const p = await createOrder([GT3]);
    await envelhecer(p.id, 49);
    expect(await expirePendingOrders(48)).toBe(1);
    expect(await statusDe(p.id)).toBe("cancelado");
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("não mexe em pedido recente", async () => {
    const p = await createOrder([GT3]);
    await envelhecer(p.id, 47);
    expect(await expirePendingOrders(48)).toBe(0);
    expect(await statusDe(p.id)).toBe("pendente");
    expect(await stockOf("oversized-gt3-rs")).toBe(10);
  });

  it("não cancela pedido que já foi pago, enviado ou entregue", async () => {
    const pago = await createOrder([GT3]);
    const enviado = await createOrder([GT3]);
    await updateOrderStatus(pago.id, "pago");
    await updateOrderStatus(enviado.id, "pago");
    await updateOrderStatus(enviado.id, "enviado");
    await envelhecer(pago.id, 500);
    await envelhecer(enviado.id, 500);
    expect(await expirePendingOrders(48)).toBe(0);
    expect(await statusDe(pago.id)).toBe("pago");
    expect(await statusDe(enviado.id)).toBe("enviado");
    expect(await stockOf("oversized-gt3-rs")).toBe(8);
  });

  it("não devolve estoque em dobro se rodar duas vezes ou ao mesmo tempo", async () => {
    const p = await createOrder([GT3]);
    await envelhecer(p.id, 100);
    const r = await Promise.all([expirePendingOrders(48), expirePendingOrders(48)]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await expirePendingOrders(48)).toBe(0);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("cancela vários de uma vez", async () => {
    const a = await createOrder([GT3]);
    const b = await createOrder([{ ...GT3, qty: 3 }]);
    const novo = await createOrder([GT3]);
    await envelhecer(a.id, 60);
    await envelhecer(b.id, 72);
    expect(await expirePendingOrders(48)).toBe(2);
    expect(await statusDe(novo.id)).toBe("pendente");
    expect(await stockOf("oversized-gt3-rs")).toBe(10);
  });
});

describe("rota do cron", () => {
  async function chamar(autorizacao?: string) {
    const { GET } = await import("@/app/api/cron/expire-orders/route");
    return GET(new Request("http://localhost/api/cron/expire-orders", { headers: autorizacao ? { authorization: autorizacao } : {} }));
  }

  it("fica fechada sem CRON_SECRET", async () => {
    expect((await chamar("Bearer qualquer")).status).toBe(503);
  });

  it("recusa quem não manda o segredo certo", async () => {
    process.env.CRON_SECRET = "segredo-do-cron";
    for (const ruim of [undefined, "", "segredo-do-cron", "Bearer errado", "bearer segredo-do-cron"]) {
      expect((await chamar(ruim)).status, String(ruim)).toBe(401);
    }
  });

  it("com o segredo certo, cancela os antigos e avisa a loja", async () => {
    process.env.CRON_SECRET = "segredo-do-cron";
    process.env.PENDING_ORDER_HOURS = "24";
    const p = await createOrder([GT3]);
    await envelhecer(p.id, 30);
    const r = await chamar("Bearer segredo-do-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ cancelados: 1 });
    expect(revalidateTag).toHaveBeenCalledWith("products", { expire: 0 });
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("não invalida o cache quando nada foi cancelado", async () => {
    process.env.CRON_SECRET = "segredo-do-cron";
    const r = await chamar("Bearer segredo-do-cron");
    expect(await r.json()).toEqual({ cancelados: 0 });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
