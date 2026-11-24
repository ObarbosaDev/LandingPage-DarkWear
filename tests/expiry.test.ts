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

// ---------------------------------------------------------------------------
// Prazos diferentes por tipo de pedido e liberação sob demanda.
//   - pedido com cobrança ONLINE (Mercado Pago) segura as peças por poucas horas (PRAZO_ONLINE_HORAS);
//   - pedido combinado só pelo WhatsApp segura por 48 horas, porque depende de uma pessoa confirmar;
//   - quando uma compra falha por falta de estoque, os pedidos pendentes vencidos são liberados na hora
//     (sem esperar o cron diário) e a compra é tentada de novo.
// ---------------------------------------------------------------------------
import { payments } from "@/server/db/schema";
import { PRAZO_ONLINE_HORAS } from "@/lib/prazos";
import { OrderError } from "@/server/orders";

/** Marca o pedido como tendo uma cobrança online iniciada (como a rota de pedidos faz ao criar a preferência). */
async function comCobranca(id: number) {
  await (await getDb()).insert(payments).values({ orderId: id, provider: "mercadopago", preferenceId: `pref-${id}`, status: "iniciado" });
}

describe("prazo por tipo de pedido", () => {
  it("pedido com cobrança online expira no prazo curto; o do WhatsApp continua com 48 horas", async () => {
    const online = await createOrder([{ ...GT3, qty: 1 }], await clienteDeTeste());
    const zap = await createOrder([{ ...GT3, qty: 1 }], await clienteDeTeste());
    await comCobranca(online.id);
    await envelhecer(online.id, PRAZO_ONLINE_HORAS + 1);
    await envelhecer(zap.id, PRAZO_ONLINE_HORAS + 1);
    expect(await expirePendingOrders()).toBe(1);
    expect(await statusDe(online.id)).toBe("cancelado");
    expect(await statusDe(zap.id)).toBe("pendente");
  });

  it("pedido online ainda dentro do prazo curto não é cancelado", async () => {
    const online = await createOrder([{ ...GT3, qty: 1 }], await clienteDeTeste());
    await comCobranca(online.id);
    await envelhecer(online.id, PRAZO_ONLINE_HORAS - 1);
    expect(await expirePendingOrders()).toBe(0);
    expect(await statusDe(online.id)).toBe("pendente");
  });

  it("pedido online já pago nunca expira, por mais antigo que seja", async () => {
    const online = await createOrder([{ ...GT3, qty: 1 }], await clienteDeTeste());
    await comCobranca(online.id);
    await updateOrderStatus(online.id, "pago");
    await envelhecer(online.id, 500);
    expect(await expirePendingOrders()).toBe(0);
    expect(await statusDe(online.id)).toBe("pago");
  });
});

describe("liberação sob demanda", () => {
  it("compra sem estoque libera pedidos vencidos e passa", async () => {
    const cliente = await clienteDeTeste();
    // Um pedido pendente e VENCIDO segura as 12 peças.
    const preso = await createOrder([{ ...GT3, qty: 12 }], cliente);
    await envelhecer(preso.id, 60);
    expect(await stockOf("oversized-gt3-rs")).toBe(0);
    const novo = await createOrder([{ ...GT3, qty: 3 }], cliente);
    expect(novo.items[0].qty).toBe(3);
    expect(await statusDe(preso.id)).toBe("cancelado");
    expect(await stockOf("oversized-gt3-rs")).toBe(9);
  });

  it("não libera pedido que ainda está no prazo: a compra continua recusada", async () => {
    const cliente = await clienteDeTeste();
    const preso = await createOrder([{ ...GT3, qty: 12 }], cliente);
    await envelhecer(preso.id, 5);
    await expect(createOrder([{ ...GT3, qty: 1 }], cliente)).rejects.toMatchObject({ status: 409 });
    expect(await statusDe(preso.id)).toBe("pendente");
  });

  it("só tenta liberar em caso de falta de estoque (erro de validação não cancela ninguém)", async () => {
    const cliente = await clienteDeTeste();
    const velho = await createOrder([{ ...GT3, qty: 1 }], cliente);
    await envelhecer(velho.id, 60);
    await expect(createOrder([{ ...GT3, size: "XG", qty: 1 }], cliente)).rejects.toBeInstanceOf(OrderError);
    expect(await statusDe(velho.id)).toBe("pendente");
  });

  it("se mesmo liberando não houver estoque, a compra falha sem deixar nada pela metade", async () => {
    const cliente = await clienteDeTeste();
    await expect(createOrder([{ ...GT3, qty: 13 }], cliente)).rejects.toMatchObject({ status: 409 });
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });
});
