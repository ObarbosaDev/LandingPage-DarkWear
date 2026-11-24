// ============================================================================
// Testes da EXPIRAÇÃO DE PEDIDOS PENDENTES (expirePendingOrders) e da rota do cron que a dispara
// (/api/cron/expire-orders).
// Por que testar: um pedido pendente segura as peças no estoque. Se a expiração cancelasse um pedido
// que já foi pago, o dono perderia uma venda; se não devolvesse as peças, a loja ficaria sem estoque.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orders } from "@/server/db/schema";
import { createOrder, expirePendingOrders } from "@/server/orders";
import { updateOrderStatus } from "@/server/admin/orders";
import { clienteDeTeste, resetDb, stockOf } from "./helpers/db";

// Fora de uma requisição do Next, o revalidateTag não tem onde atuar: nos testes ele só é observado.
// (vi.fn() é uma "função espiã": registra se e como foi chamada, para o teste conferir depois.)
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));

const GT3 = { slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 2 };
const HORA = 3600 * 1000;

beforeEach(async () => {
  await resetDb();
  revalidateTag.mockClear();
  // Cada teste começa sem estas variáveis; os que precisam as definem.
  delete process.env.CRON_SECRET;
  delete process.env.PENDING_ORDER_HOURS;
});

/** "Envelhece" um pedido: muda a data de criação dele para N horas atrás, direto no banco. */
async function envelhecer(id: number, horas: number) {
  const db = await getDb();
  await db
    .update(orders)
    .set({ createdAt: new Date(Date.now() - horas * HORA) })
    .where(eq(orders.id, id));
}

/** Lê o status atual de um pedido direto do banco. */
async function statusDe(id: number) {
  const [o] = await (await getDb()).select({ s: orders.status }).from(orders).where(eq(orders.id, id));
  return o.s;
}

describe("expirePendingOrders", () => {
  it("cancela pedido pendente antigo e devolve as peças", async () => {
    const p = await createOrder([GT3], await clienteDeTeste());
    await envelhecer(p.id, 49);
    expect(await expirePendingOrders(48)).toBe(1);
    expect(await statusDe(p.id)).toBe("cancelado");
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  // 47 horas é menos que o prazo de 48: o pedido ainda pode ser pago.
  it("não mexe em pedido recente", async () => {
    const p = await createOrder([GT3], await clienteDeTeste());
    await envelhecer(p.id, 47);
    expect(await expirePendingOrders(48)).toBe(0);
    expect(await statusDe(p.id)).toBe("pendente");
    expect(await stockOf("oversized-gt3-rs")).toBe(10);
  });

  // Dois pedidos MUITO antigos (500 h), mas já pagos/enviados: pertencem a clientes que pagaram, então
  // a expiração jamais pode tocá-los.
  it("não cancela pedido que já foi pago, enviado ou entregue", async () => {
    const pago = await createOrder([GT3], await clienteDeTeste());
    const enviado = await createOrder([GT3], await clienteDeTeste());
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

  // Se o cron rodar duas vezes juntas (ou repetir), as peças não podem voltar duas vezes ao estoque.
  it("não devolve estoque em dobro se rodar duas vezes ou ao mesmo tempo", async () => {
    const p = await createOrder([GT3], await clienteDeTeste());
    await envelhecer(p.id, 100);
    const r = await Promise.all([expirePendingOrders(48), expirePendingOrders(48)]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await expirePendingOrders(48)).toBe(0);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("cancela vários de uma vez", async () => {
    const a = await createOrder([GT3], await clienteDeTeste());
    const b = await createOrder([{ ...GT3, qty: 3 }], await clienteDeTeste());
    const novo = await createOrder([GT3], await clienteDeTeste());
    await envelhecer(a.id, 60);
    await envelhecer(b.id, 72);
    expect(await expirePendingOrders(48)).toBe(2);
    expect(await statusDe(novo.id)).toBe("pendente");
    expect(await stockOf("oversized-gt3-rs")).toBe(10);
  });
});

describe("rota do cron", () => {
  /** Chama a rota como a Vercel chamaria, com (ou sem) o cabeçalho Authorization. */
  async function chamar(autorizacao?: string) {
    const { GET } = await import("@/app/api/cron/expire-orders/route");
    return GET(new Request("http://localhost/api/cron/expire-orders", { headers: autorizacao ? { authorization: autorizacao } : {} }));
  }

  // Sem CRON_SECRET configurado, a rota fecha (503): melhor do que ficar aberta a qualquer um.
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
    const p = await createOrder([GT3], await clienteDeTeste());
    await envelhecer(p.id, 30);
    const r = await chamar("Bearer segredo-do-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ cancelados: 1 });
    // Avisa o cache da loja que o estoque mudou (as peças voltaram).
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
