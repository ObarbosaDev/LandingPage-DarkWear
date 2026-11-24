// ============================================================================
// Testes do ESTOQUE POR VARIAÇÃO (tamanho x cor): compra, cancelamento, edição de produto e ajuste do dono.
// O que mais importa provar:
//   - não se vende um tamanho/cor que está zerado, mesmo que a peça tenha estoque em outro tamanho;
//   - a compra baixa SÓ a variação comprada, e o cancelamento devolve a ela (o total acompanha);
//   - o último item de uma variação nunca é vendido duas vezes;
//   - editar tamanhos e cores cria/remove variações sem zerar o estoque das que continuam;
//   - o ajuste do dono é "tudo ou nada".
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { chaveDaVariacao } from "@/lib/variants";
import { createProduct, listVariantStock, setVariantStock, updateProduct, type ProductInput } from "@/server/admin/products";
import { getProduct, getProducts } from "@/server/catalog";
import { getDb } from "@/server/db";
import { productStock } from "@/server/db/schema";
import { cancelOrder, createOrder, OrderError } from "@/server/orders";
import { clienteDeTeste, resetDb, stockOf } from "./helpers/db";

// O catálogo usa o cache do Next ("use cache"), que só existe dentro do servidor Next: aqui ele vira um "não faz nada".
vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {} }));

beforeEach(resetDb);

// A peça de teste: GT3 tem 12 unidades, todas no M (ver ESTOQUE_DE_TESTE). P, G e GG estão zerados.
const GT3 = (size: string, qty = 1) => ({ slug: "oversized-gt3-rs", size, color: "Preta", qty });

async function variacao(slug: string, size: string, color: string): Promise<number | undefined> {
  const db = await getDb();
  const [r] = await db
    .select({ stock: productStock.stock })
    .from(productStock)
    .where(and(eq(productStock.productSlug, slug), eq(productStock.size, size), eq(productStock.color, color)));
  return r?.stock;
}

const novoProduto = (o: Partial<ProductInput> = {}): ProductInput => ({
  slug: "camisa-teste",
  name: "Camisa Teste",
  priceCents: 5000,
  description: "",
  category: "Pronta entrega",
  sizes: ["P", "M"],
  colors: ["Preta", "Branca"],
  stock: 3,
  image: null,
  photoBg: null,
  active: true,
  ...o,
});

describe("compra por variação", () => {
  it("recusa tamanho zerado mesmo havendo estoque em outro tamanho da mesma peça", async () => {
    const cliente = await clienteDeTeste();
    await expect(createOrder([GT3("G")], cliente)).rejects.toMatchObject({ status: 409, message: /Estoque insuficiente.*tamanho G/ });
    // Nada mudou: o total continua 12 e o M continua inteiro.
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBe(12);
  });

  it("baixa só a variação comprada e o total da peça acompanha", async () => {
    await createOrder([GT3("M", 5)], await clienteDeTeste());
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBe(7);
    expect(await variacao("oversized-gt3-rs", "P", "Preta")).toBe(0);
    expect(await stockOf("oversized-gt3-rs")).toBe(7);
  });

  it("é tudo ou nada: se um item falha por variação, os outros não são baixados", async () => {
    await expect(createOrder([GT3("M", 2), GT3("G", 1)], await clienteDeTeste())).rejects.toBeInstanceOf(OrderError);
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBe(12);
  });

  it("a última unidade de uma variação nunca é vendida duas vezes (pedidos simultâneos)", async () => {
    await setVariantStock("oversized-gt3-rs", { "M|Preta": 1 });
    const cliente = await clienteDeTeste();
    const r = await Promise.allSettled(Array.from({ length: 6 }, () => createOrder([GT3("M")], cliente)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBe(0);
    expect(await stockOf("oversized-gt3-rs")).toBe(0);
  });

  it("cancelar devolve as peças à variação certa (e o total)", async () => {
    await setVariantStock("oversized-gt3-rs", { "G|Preta": 4 });
    const p = await createOrder([GT3("M", 3), GT3("G", 2)], await clienteDeTeste());
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBe(9);
    expect(await variacao("oversized-gt3-rs", "G", "Preta")).toBe(2);
    expect(await cancelOrder(p.id)).toBe(true);
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBe(12);
    expect(await variacao("oversized-gt3-rs", "G", "Preta")).toBe(4);
    expect(await stockOf("oversized-gt3-rs")).toBe(16);
    // Cancelar de novo não devolve nada a mais.
    expect(await cancelOrder(p.id)).toBe(false);
    expect(await stockOf("oversized-gt3-rs")).toBe(16);
  });

  it("com duas cores, comprar e cancelar mexe só na cor comprada", async () => {
    await createProduct(novoProduto({ sizes: ["M"], colors: ["Preta", "Branca"], stock: 5 }));
    const p = await createOrder([{ slug: "camisa-teste", size: "M", color: "Branca", qty: 2 }], await clienteDeTeste());
    expect(await variacao("camisa-teste", "M", "Branca")).toBe(3);
    expect(await variacao("camisa-teste", "M", "Preta")).toBe(5);
    await cancelOrder(p.id);
    expect(await variacao("camisa-teste", "M", "Branca")).toBe(5);
    expect(await variacao("camisa-teste", "M", "Preta")).toBe(5);
  });

  it("cancelar um pedido de uma variação que o dono já removeu não dá erro", async () => {
    const p = await createOrder([GT3("M", 2)], await clienteDeTeste());
    await updateProduct({ ...novoProduto({ slug: "oversized-gt3-rs", name: "Oversized GT3 RS", sizes: ["P", "G", "GG"], colors: ["Preta"] }) });
    expect(await cancelOrder(p.id)).toBe(true);
    expect(await variacao("oversized-gt3-rs", "M", "Preta")).toBeUndefined();
  });
});

describe("catálogo mostra o estoque por variação", () => {
  it("getProduct e getProducts trazem o estoque de cada tamanho e cor", async () => {
    await createOrder([GT3("M", 2)], await clienteDeTeste());
    const p = await getProduct("oversized-gt3-rs");
    expect(p?.variants).toEqual({ "P|Preta": 0, "M|Preta": 10, "G|Preta": 0, "GG|Preta": 0 });
    expect(p?.stock).toBe(10);
    const todos = await getProducts();
    expect(todos.find((x) => x.slug === "oversized-gt3-rs")?.variants["M|Preta"]).toBe(10);
  });
});

describe("cadastro e edição do dono", () => {
  it("cadastrar cria uma variação para cada tamanho x cor com o estoque inicial de cada uma", async () => {
    expect(await createProduct(novoProduto())).toBe("ok");
    const v = (await listVariantStock()).get("camisa-teste");
    expect(v).toEqual({ "P|Preta": 3, "P|Branca": 3, "M|Preta": 3, "M|Branca": 3 });
    expect(await stockOf("camisa-teste")).toBe(12);
  });

  it("editar tamanhos e cores cria as novas (com 0), remove as que saíram e NÃO mexe nas que ficam", async () => {
    await createProduct(novoProduto());
    await setVariantStock("camisa-teste", { "P|Preta": 9 });
    await updateProduct(novoProduto({ sizes: ["P", "G"], colors: ["Preta"] }));
    expect((await listVariantStock()).get("camisa-teste")).toEqual({ "P|Preta": 9, "G|Preta": 0 });
    expect(await stockOf("camisa-teste")).toBe(9);
  });

  it("apagar a variação não deixa o total da peça com estoque fantasma", async () => {
    await createProduct(novoProduto({ stock: 5 }));
    await updateProduct(novoProduto({ sizes: ["P"], colors: ["Preta"] }));
    expect(await stockOf("camisa-teste")).toBe(5);
  });
});

describe("ajuste do dono (setVariantStock)", () => {
  it("grava várias variações de uma vez e recalcula o total", async () => {
    expect(await setVariantStock("oversized-gt3-rs", { "P|Preta": 2, "M|Preta": 1, "G|Preta": 4 })).toBe(true);
    expect(await stockOf("oversized-gt3-rs")).toBe(2 + 1 + 4 + 0);
  });

  it("recusa TUDO se um valor for inválido (nada gravado pela metade)", async () => {
    for (const ruim of [-1, 1.5, NaN, 100001]) {
      expect(await setVariantStock("oversized-gt3-rs", { "P|Preta": 7, "G|Preta": ruim })).toBe(false);
    }
    expect(await variacao("oversized-gt3-rs", "P", "Preta")).toBe(0);
  });

  it("recusa combinação que não existe, peça que não existe e conjunto vazio", async () => {
    expect(await setVariantStock("oversized-gt3-rs", { "XG|Preta": 3 })).toBe(false);
    expect(await setVariantStock("oversized-gt3-rs", { "M|Rosa": 3 })).toBe(false);
    expect(await setVariantStock("oversized-gt3-rs", { "M|Preta|x": 3 })).toBe(false);
    expect(await setVariantStock("nao-existe", { "M|Preta": 3 })).toBe(false);
    expect(await setVariantStock("oversized-gt3-rs", {})).toBe(false);
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
  });

  it("a chave usa o mesmo formato do catálogo", () => {
    expect(chaveDaVariacao("M", "Preta")).toBe("M|Preta");
  });
});
