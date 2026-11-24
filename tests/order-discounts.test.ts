// ============================================================================
// Testes dos DESCONTOS NO PEDIDO (cupom e Pix) em src/server/orders.ts.
// O que mais importa provar (é dinheiro):
//   - o servidor recalcula tudo: o total que o navegador "acha" não conta;
//   - o cupom respeita as regras (ativo, validade, mínimo, limite de usos) e só vale UMA vez por cliente;
//   - cancelar o pedido devolve o uso do cupom;
//   - pedido recusado por causa do cupom não baixa estoque nem consome o cupom ("tudo ou nada");
//   - o desconto do Pix só vale quando o dono ligou e o cliente escolheu Pix.
// ============================================================================

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createCoupon } from "@/server/coupons";
import { getDb } from "@/server/db";
import { coupons, orders } from "@/server/db/schema";
import { cancelOrder, createOrder, OrderError } from "@/server/orders";
import { clienteDeTeste, resetDb, stockOf } from "./helpers/db";

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(coupons);
});
afterEach(() => {
  delete process.env.PIX_DISCOUNT_PERCENT;
});

const GT3 = (qty = 1) => [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty }]; // R$ 89,90 cada

const novoCupom = (o: Partial<Parameters<typeof createCoupon>[0]> = {}) =>
  createCoupon({ code: "BEMVINDO10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true, ...o });

const usos = async (code = "BEMVINDO10") => (await (await getDb()).select().from(coupons).where(eq(coupons.code, code)))[0].usedCount;
async function falha(p: Promise<unknown>): Promise<OrderError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OrderError);
    return e as OrderError;
  }
  throw new Error("era para falhar");
}

describe("cupom no pedido", () => {
  it("aplica o desconto, guarda quanto foi e o total é o que o cliente paga", async () => {
    await novoCupom();
    const p = await createOrder(GT3(2), await clienteDeTeste(), null, { coupon: "bemvindo10" });
    // 2 x 89,90 = 179,80; 10% = 17,98 → 161,82
    expect(p).toMatchObject({ subtotalCents: 17980, couponDiscountCents: 1798, pixDiscountCents: 0, totalCents: 16182 });
    const [o] = await (await getDb()).select().from(orders).where(eq(orders.id, p.id));
    expect(o).toMatchObject({ totalCents: 16182, couponCode: "BEMVINDO10", couponDiscountCents: 1798, pixDiscountCents: 0 });
    expect(await usos()).toBe(1);
  });

  it("cupom de valor fixo", async () => {
    await novoCupom({ code: "MENOS15", kind: "fixed", value: 1500 });
    const p = await createOrder(GT3(), await clienteDeTeste(), null, { coupon: "MENOS15" });
    expect(p).toMatchObject({ subtotalCents: 8990, couponDiscountCents: 1500, totalCents: 7490 });
  });

  it("sem cupom, nada muda (o campo vazio também não conta)", async () => {
    const p = await createOrder(GT3(), await clienteDeTeste(), null, { coupon: "  " });
    expect(p).toMatchObject({ subtotalCents: 8990, couponDiscountCents: 0, totalCents: 8990 });
  });

  it("recusa cupom inexistente, mal escrito, inativo, vencido, ainda não começado, esgotado e com mínimo", async () => {
    const cliente = await clienteDeTeste();
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "NAOEXISTE" }))).message).toMatch(/não encontrado/i);
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "<x>" }))).message).toMatch(/inválido/i);
    await novoCupom({ code: "INATIVO", active: false });
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "INATIVO" }))).message).toMatch(/não está ativo/i);
    await novoCupom({ code: "VENCIDO", expiresAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 86400000) });
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "VENCIDO" }))).message).toMatch(/venceu/i);
    await novoCupom({ code: "FUTURO", startsAt: new Date(Date.now() + 86400000) });
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "FUTURO" }))).message).toMatch(/ainda não/i);
    await novoCupom({ code: "ESGOTADO", maxUses: 1 });
    await createOrder(GT3(), await clienteDeTeste("outra@exemplo.com"), null, { coupon: "ESGOTADO" });
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "ESGOTADO" }))).message).toMatch(/esgot/i);
    await novoCupom({ code: "GRANDE", minOrderCents: 50000 });
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "GRANDE" }))).message).toMatch(/R\$\s?500,00/);
  });

  it("pedido recusado por causa do cupom não baixa estoque nem consome o cupom", async () => {
    await novoCupom({ code: "GRANDE", minOrderCents: 50000 });
    await falha(createOrder(GT3(2), await clienteDeTeste(), null, { coupon: "GRANDE" }));
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
    expect(await usos("GRANDE")).toBe(0);
  });

  it("um cliente só usa o mesmo cupom uma vez (enquanto o pedido não for cancelado)", async () => {
    await novoCupom();
    const cliente = await clienteDeTeste();
    const p = await createOrder(GT3(), cliente, null, { coupon: "BEMVINDO10" });
    expect((await falha(createOrder(GT3(), cliente, null, { coupon: "BEMVINDO10" }))).message).toMatch(/já usou/i);
    expect(await usos()).toBe(1);
    expect(await stockOf("oversized-gt3-rs")).toBe(11);
    // Cancelou? O cupom volta a valer para ele, e o contador desce.
    await cancelOrder(p.id);
    expect(await usos()).toBe(0);
    await expect(createOrder(GT3(), cliente, null, { coupon: "BEMVINDO10" })).resolves.toMatchObject({ couponDiscountCents: 899 });
  });

  it("cancelar duas vezes devolve o uso do cupom uma vez só", async () => {
    await novoCupom();
    const a = await createOrder(GT3(), await clienteDeTeste("a@exemplo.com"), null, { coupon: "BEMVINDO10" });
    await createOrder(GT3(), await clienteDeTeste("b@exemplo.com"), null, { coupon: "BEMVINDO10" });
    await Promise.all([cancelOrder(a.id), cancelOrder(a.id)]);
    expect(await usos()).toBe(1);
  });

  it("o último uso de um cupom limitado é de UM cliente só, mesmo com pedidos simultâneos", async () => {
    await novoCupom({ maxUses: 1 });
    const clientes = await Promise.all([1, 2, 3, 4].map((i) => clienteDeTeste(`c${i}@exemplo.com`)));
    const r = await Promise.allSettled(clientes.map((c) => createOrder(GT3(), c, null, { coupon: "BEMVINDO10" })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await usos()).toBe(1);
    // Os pedidos que falharam também não baixaram estoque.
    expect(await stockOf("oversized-gt3-rs")).toBe(11);
  });

  it("o mesmo cliente com dois pedidos simultâneos com o mesmo cupom: só um passa", async () => {
    await novoCupom();
    const cliente = await clienteDeTeste();
    const r = await Promise.allSettled([1, 2, 3].map(() => createOrder(GT3(), cliente, null, { coupon: "BEMVINDO10" })).flat());
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await usos()).toBe(1);
    expect(await stockOf("oversized-gt3-rs")).toBe(11);
  });
});

describe("desconto no Pix", () => {
  it("com o Pix ligado pelo dono e escolhido pelo cliente, desconta o percentual", async () => {
    process.env.PIX_DISCOUNT_PERCENT = "5";
    const p = await createOrder(GT3(), await clienteDeTeste(), null, { pix: true });
    // 5% de 89,90 = 4,495 → 4,49
    expect(p).toMatchObject({ subtotalCents: 8990, pixDiscountCents: 449, couponDiscountCents: 0, totalCents: 8541 });
    const [o] = await (await getDb()).select().from(orders).where(eq(orders.id, p.id));
    expect(o.pixDiscountCents).toBe(449);
  });

  it("cupom e Pix juntos: o Pix desconta sobre o valor já com o cupom", async () => {
    process.env.PIX_DISCOUNT_PERCENT = "5";
    await novoCupom();
    const p = await createOrder(GT3(2), await clienteDeTeste(), null, { pix: true, coupon: "BEMVINDO10" });
    // 179,80 - 17,98 = 161,82; 5% = 8,09 → 153,73
    expect(p).toMatchObject({ couponDiscountCents: 1798, pixDiscountCents: 809, totalCents: 15373 });
  });

  it("sem escolher Pix, não há desconto de Pix", async () => {
    process.env.PIX_DISCOUNT_PERCENT = "5";
    const p = await createOrder(GT3(), await clienteDeTeste(), null, {});
    expect(p.pixDiscountCents).toBe(0);
    expect(p.totalCents).toBe(8990);
  });

  it("escolher Pix com o desconto desligado é recusado (a tela nem oferece)", async () => {
    const e = await falha(createOrder(GT3(), await clienteDeTeste(), null, { pix: true }));
    expect(e.message).toMatch(/Pix/);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("percentual inválido na configuração desliga o desconto, e acima do teto é limitado a 30%", async () => {
    for (const ruim of ["abc", "-3", "0", "2.5", ""]) {
      process.env.PIX_DISCOUNT_PERCENT = ruim;
      await falha(createOrder(GT3(), await clienteDeTeste(`r${ruim.length}${ruim.charCodeAt(0) || 0}@exemplo.com`), null, { pix: true }));
    }
    process.env.PIX_DISCOUNT_PERCENT = "80";
    const p = await createOrder(GT3(), await clienteDeTeste(), null, { pix: true });
    expect(p.pixDiscountCents).toBe(Math.floor((8990 * 30) / 100));
  });
});

describe("o banco confere os descontos", () => {
  it("recusa desconto negativo e desconto de cupom sem cupom", async () => {
    const p = await createOrder(GT3(), await clienteDeTeste());
    const db = await getDb();
    await expect(db.update(orders).set({ pixDiscountCents: -1 }).where(eq(orders.id, p.id))).rejects.toThrow();
    await expect(db.update(orders).set({ couponDiscountCents: 100 }).where(eq(orders.id, p.id))).rejects.toThrow();
  });
  it("recusa cupom com percentual acima de 90 ou usos além do limite", async () => {
    const db = await getDb();
    await expect(db.insert(coupons).values({ code: "ABUSO", kind: "percent", value: 95 })).rejects.toThrow();
    await expect(db.insert(coupons).values({ code: "ABUSO", kind: "fixed", value: 100, maxUses: 1, usedCount: 2 })).rejects.toThrow();
    await expect(db.insert(coupons).values({ code: "ab", kind: "fixed", value: 100 })).rejects.toThrow();
  });
});
