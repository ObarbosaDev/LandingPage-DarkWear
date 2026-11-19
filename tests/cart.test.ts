import { describe, expect, it } from "vitest";
import { normalizeStored } from "@/lib/cart";

const item = { id: "a|M|Preta", slug: "a", name: "A", size: "M", color: "Preta", qty: 2, max: 5 };

describe("normalizeStored (carrinho salvo no navegador)", () => {
  it("mantém um carrinho já em centavos", () => {
    expect(normalizeStored([{ ...item, priceCents: 8990 }])).toEqual([{ ...item, priceCents: 8990 }]);
  });

  it("converte o formato antigo (reais) sem erro de arredondamento", () => {
    const [i] = normalizeStored([{ ...item, price: 89.9 }]);
    expect(i.priceCents).toBe(8990);
    expect("price" in i).toBe(false);
    expect(normalizeStored([{ ...item, price: 19.99 }])[0].priceCents).toBe(1999);
  });

  it("descarta itens inválidos em vez de quebrar a sacola", () => {
    expect(normalizeStored([{ foo: 1 }, { ...item, priceCents: 100 }, null, "x"])).toHaveLength(1);
    expect(normalizeStored([{ ...item }])).toEqual([]); // sem preço nenhum
  });

  it("devolve vazio se o conteúdo não for uma lista", () => {
    for (const lixo of [null, undefined, {}, "texto", 7]) expect(normalizeStored(lixo)).toEqual([]);
  });
});
