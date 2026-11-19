import { describe, expect, it } from "vitest";
import { parsePriceToCents, parseProductForm } from "@/server/admin/products";

describe("parsePriceToCents", () => {
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

  it.each(["", "   ", "abc", "-5", "12,3,4", "R$ 89,90"])("recusa %j", (entrada) => {
    expect(parsePriceToCents(entrada)).toBeNull();
  });
});

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

  it("recusa endereço fora do padrão ao criar", () => {
    for (const slug of ["Camisa Preta", "camisa_preta", "-camisa", "camisa-", "açaí", "a"]) {
      expect(parseProductForm(form({ slug }), "novo").ok, slug).toBe(false);
    }
  });

  it("remove tamanhos repetidos", () => {
    const r = parseProductForm(form({ sizes: "P, P, M,  ,M" }), "novo");
    expect(r.ok && r.data.sizes).toEqual(["P", "M"]);
  });

  it("recusa estoque inválido ao criar", () => {
    for (const stock of ["-1", "1.5", "abc", "", "100001"]) {
      expect(parseProductForm(form({ stock }), "novo").ok, stock).toBe(false);
    }
  });

  it("não lê o estoque na edição (as vendas mudam esse número)", () => {
    const r = parseProductForm(form({ stock: "999" }), "editar");
    expect(r.ok && r.data.stock).toBe(0);
  });

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

  it("produto sem a caixa 'ativo' marcada fica oculto", () => {
    const f = form({});
    f.delete("active");
    const r = parseProductForm(f, "novo");
    expect(r.ok && r.data.active).toBe(false);
  });
});
