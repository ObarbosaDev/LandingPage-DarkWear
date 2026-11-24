// ============================================================================
// Testes do FORMULÁRIO DE PRODUTO do painel (src/server/admin/products.ts):
// a leitura do preço digitado e a validação de cada campo.
// Por que testar: é aqui que um preço digitado errado vira dinheiro errado na loja, ou que um dado
// inválido poderia entrar no banco.
// ============================================================================

import { describe, expect, it } from "vitest";
import { parsePriceToCents, parseProductForm } from "@/server/admin/products";

describe("parsePriceToCents", () => {
  // it.each roda o mesmo teste para cada linha da tabela: [o que o dono digitou, centavos esperados].
  it.each([
    ["89,90", 8990],
    ["89.90", 8990],
    ["1.299,90", 129990],
    ["1.299", 129900], // ponto de milhar sem vírgula
    ["1.299.000", null], // passa do limite de R$ 100.000
    ["100000", 10_000_000],
    ["100000,01", null],
    ["0", 0],
    ["79", 7900],
    [" 59,5 ", 5950],
  ])("lê %s", (entrada, esperado) => {
    expect(parsePriceToCents(entrada)).toBe(esperado);
  });

  // Entradas que não são preço de jeito nenhum: devem ser recusadas (null).
  it.each(["", "   ", "abc", "-5", "12,3,4", "R$ 89,90"])("recusa %j", (entrada) => {
    expect(parsePriceToCents(entrada)).toBeNull();
  });
});

/**
 * Monta um formulário de produto VÁLIDO e deixa cada teste trocar só o campo que quer provar.
 * Ex.: form({ stock: "-1" }) = o formulário certo, mas com estoque inválido.
 */
function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  const base = {
    slug: "camisa-preta",
    name: "Camisa Preta",
    price: "89,90",
    stock: "5",
    category: "Pronta entrega",
    sizes: "P, M, G",
    colors: "Preta",
    description: "Teste",
    image: "",
    photoBg: "",
    active: "on",
  };
  for (const [k, v] of Object.entries({ ...base, ...campos })) f.set(k, v);
  return f;
}

describe("parseProductForm", () => {
  it("aceita um produto válido", () => {
    const r = parseProductForm(form({}), "novo");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toMatchObject({ slug: "camisa-preta", priceCents: 8990, stock: 5, sizes: ["P", "M", "G"], active: true });
    }
  });

  // O endereço vira parte do link da peça: não pode ter espaço, acento, maiúscula nem hífen solto.
  it("recusa endereço fora do padrão ao criar", () => {
    for (const slug of ["Camisa Preta", "camisa_preta", "-camisa", "camisa-", "açaí", "a"]) {
      expect(parseProductForm(form({ slug }), "novo").ok, slug).toBe(false);
    }
  });

  it("remove tamanhos repetidos", () => {
    const r = parseProductForm(form({ sizes: "P, P, M,  ,M" }), "novo");
    expect(r.ok && r.data.sizes).toEqual(["P", "M"]);
  });

  // O "|" separa tamanho e cor nas chaves de estoque ("M|Preta"); num nome ele confundiria as chaves.
  it('recusa o caractere "|" em tamanhos e cores', () => {
    expect(parseProductForm(form({ sizes: "P|Q, M" }), "novo").ok).toBe(false);
    expect(parseProductForm(form({ colors: "Preta|Branca" }), "novo").ok).toBe(false);
  });

  // Inclui o campo vazio "": antes ele virava estoque 0 sem avisar o dono.
  it("recusa estoque inválido ao criar", () => {
    for (const stock of ["-1", "1.5", "abc", "", "100001"]) {
      expect(parseProductForm(form({ stock }), "novo").ok, stock).toBe(false);
    }
  });

  // Ao editar, o estoque NÃO é lido do formulário: seria apagar as vendas feitas enquanto o dono editava.
  it("não lê o estoque na edição (as vendas mudam esse número)", () => {
    const r = parseProductForm(form({ stock: "999" }), "editar");
    expect(r.ok && r.data.stock).toBe(0);
  });

  // A foto precisa estar na pasta /products: bloqueia link para outro site e a fuga de pasta ("..").
  it("só aceita foto dentro de /products/", () => {
    expect(parseProductForm(form({ image: "/products/foto.webp" }), "novo").ok).toBe(true);
    for (const image of ["https://x.com/a.png", "/outra/foto.webp", "/products/../segredo", "foto.webp"]) {
      expect(parseProductForm(form({ image }), "novo").ok, image).toBe(false);
    }
  });

  it("recusa categoria, fundo da foto e descrição inválidos", () => {
    expect(parseProductForm(form({ category: "Outra" }), "novo").ok).toBe(false);
    expect(parseProductForm(form({ photoBg: "azul" }), "novo").ok).toBe(false);
    expect(parseProductForm(form({ description: "x".repeat(601) }), "novo").ok).toBe(false);
  });

  // Caixa de seleção desmarcada não é enviada pelo navegador: a ausência do campo significa "desmarcada".
  it("produto sem a caixa 'ativo' marcada fica oculto", () => {
    const f = form({});
    f.delete("active");
    const r = parseProductForm(f, "novo");
    expect(r.ok && r.data.active).toBe(false);
  });
});
