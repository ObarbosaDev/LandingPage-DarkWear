import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { products } from "@/server/db/schema";
import { cancelOrder, createOrder, orderNumber, OrderError } from "@/server/orders";
import { resetDb, stockOf } from "./helpers/db";

const GT3 = { slug: "oversized-gt3-rs", size: "M", color: "Preta" }; // estoque inicial 12, R$ 89,90
const MUMIA = { slug: "camisa-mumia", size: "G", color: "Branca" }; // estoque inicial 5, R$ 99,90

beforeEach(resetDb);

async function falha(promessa: Promise<unknown>): Promise<OrderError> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(OrderError);
    return e as OrderError;
  }
  throw new Error("era para falhar, mas passou");
}

describe("createOrder", () => {
  it("registra o pedido, calcula o total no servidor e baixa o estoque", async () => {
    const pedido = await createOrder([{ ...GT3, qty: 2 }, { ...MUMIA, qty: 1 }]);
    expect(pedido.totalCents).toBe(2 * 8990 + 9990);
    expect(pedido.status).toBe("pendente");
    expect(pedido.number).toBe(orderNumber(pedido.id));
    expect(pedido.items.map((i) => i.name)).toEqual(["Oversized GT3 RS", "Camisa Múmia"]); // ordem do carrinho
    expect(await stockOf("oversized-gt3-rs")).toBe(10);
    expect(await stockOf("camisa-mumia")).toBe(4);
  });

  it("mantém a ordem do carrinho mesmo baixando o estoque em ordem alfabética", async () => {
    const pedido = await createOrder([{ ...MUMIA, qty: 1 }, { ...GT3, qty: 1 }]);
    expect(pedido.items.map((i) => i.name)).toEqual(["Camisa Múmia", "Oversized GT3 RS"]);
  });

  it("junta linhas repetidas do mesmo item", async () => {
    const pedido = await createOrder([{ ...GT3, qty: 1 }, { ...GT3, qty: 2 }]);
    expect(pedido.items).toHaveLength(1);
    expect(pedido.items[0].qty).toBe(3);
    expect(await stockOf("oversized-gt3-rs")).toBe(9);
  });

  it("ignora qualquer preço enviado pelo cliente", async () => {
    const pedido = await createOrder([{ ...GT3, qty: 1, price: 0.01, priceCents: 1 }]);
    expect(pedido.totalCents).toBe(8990);
  });

  it("recusa estoque insuficiente (409) sem mexer no estoque", async () => {
    const e = await falha(createOrder([{ ...MUMIA, qty: 6 }]));
    expect(e.status).toBe(409);
    expect(await stockOf("camisa-mumia")).toBe(5);
  });

  it("é tudo ou nada: se um item falha, o outro não é descontado", async () => {
    await falha(createOrder([{ ...GT3, qty: 2 }, { ...MUMIA, qty: 99 }]));
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("recusa tamanho, cor e produto inválidos", async () => {
    await falha(createOrder([{ ...GT3, size: "XG", qty: 1 }]));
    await falha(createOrder([{ ...GT3, color: "Rosa", qty: 1 }]));
    await falha(createOrder([{ slug: "nao-existe", size: "M", color: "Preta", qty: 1 }]));
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("recusa quantidade inválida e carrinho vazio", async () => {
    for (const qty of [0, -1, 1.5, 100, "2", null]) await falha(createOrder([{ ...GT3, qty }]));
    await falha(createOrder([]));
    await falha(createOrder("lixo"));
    await falha(createOrder(null));
  });

  it("não vende produto oculto", async () => {
    await (await getDb()).update(products).set({ active: false }).where(eq(products.slug, GT3.slug));
    await falha(createOrder([{ ...GT3, qty: 1 }]));
  });

  // O PGlite atende uma consulta por vez, então aqui o que se prova é a regra (o UPDATE condicional
  // nunca deixa o estoque negativo nem vende além dele), não a disputa de linhas do Postgres real.
  it("com muitos pedidos ao mesmo tempo, só vende o que existe", async () => {
    const resultados = await Promise.allSettled(Array.from({ length: 20 }, () => createOrder([{ ...GT3, qty: 1 }])));
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(12);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(8);
    expect(await stockOf("oversized-gt3-rs")).toBe(0);
  });
});

describe("cancelOrder", () => {
  it("devolve as peças ao estoque", async () => {
    const p = await createOrder([{ ...GT3, qty: 3 }, { ...MUMIA, qty: 2 }]);
    expect(await cancelOrder(p.id)).toBe(true);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
    expect(await stockOf("camisa-mumia")).toBe(5);
  });

  it("cancelar de novo não devolve estoque em dobro", async () => {
    const p = await createOrder([{ ...GT3, qty: 2 }]);
    expect(await cancelOrder(p.id)).toBe(true);
    expect(await cancelOrder(p.id)).toBe(false);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("três cancelamentos ao mesmo tempo repõem o estoque uma vez só", async () => {
    const p = await createOrder([{ ...GT3, qty: 2 }]);
    const r = await Promise.all([cancelOrder(p.id), cancelOrder(p.id), cancelOrder(p.id)]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("pedido inexistente não faz nada", async () => {
    expect(await cancelOrder(99999)).toBe(false);
  });
});
