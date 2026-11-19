// ============================================================================
// Testes do CARRINHO SALVO NO NAVEGADOR (normalizeStored em src/lib/cart.tsx).
// Por que testar: o localStorage pode conter um carrinho do formato antigo (preço em reais),
// dados corrompidos ou editados à mão. A sacola precisa aproveitar o que dá e nunca quebrar a página.
// ============================================================================

import { describe, expect, it } from "vitest";
import { normalizeStored } from "@/lib/cart";

// Um item de carrinho válido (sem o preço), usado como base nos testes.
const item = { id: "a|M|Preta", slug: "a", name: "A", size: "M", color: "Preta", qty: 2, max: 5 };

describe("normalizeStored (carrinho salvo no navegador)", () => {
  // Caminho feliz: o formato atual passa sem mudanças.
  it("mantém um carrinho já em centavos", () => {
    expect(normalizeStored([{ ...item, priceCents: 8990 }])).toEqual([{ ...item, priceCents: 8990 }]);
  });

  // Clientes que já tinham carrinho antes da mudança para centavos não podem perder os itens.
  it("converte o formato antigo (reais) sem erro de arredondamento", () => {
    const [i] = normalizeStored([{ ...item, price: 89.9 }]);
    expect(i.priceCents).toBe(8990);
    // O campo antigo "price" não deve ficar guardado junto do novo.
    expect("price" in i).toBe(false);
    expect(normalizeStored([{ ...item, price: 19.99 }])[0].priceCents).toBe(1999);
  });

  // Lixo no armazenamento descarta só o item ruim, e não a sacola inteira (um item null já derrubou tudo antes).
  it("descarta itens inválidos em vez de quebrar a sacola", () => {
    expect(normalizeStored([{ foo: 1 }, { ...item, priceCents: 100 }, null, "x"])).toHaveLength(1);
    expect(normalizeStored([{ ...item }])).toEqual([]); // sem preço nenhum
  });

  it("devolve vazio se o conteúdo não for uma lista", () => {
    for (const lixo of [null, undefined, {}, "texto", 7]) expect(normalizeStored(lixo)).toEqual([]);
  });
});
