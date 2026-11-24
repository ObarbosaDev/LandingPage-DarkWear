// ============================================================================
// Testes das variações (tamanho x cor): divisão do estoque e a migração 0010 (carga e gatilho do total).
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { chaveDaVariacao, dividirEstoque, estoqueDaVariacao, somarEstoque } from "@/lib/variants";
import { MIGRATIONS, runMigrations, type SqlRunner } from "@/server/db/migrations";

describe("dividirEstoque", () => {
  it("divide por igual e manda o que sobra para as primeiras combinações", () => {
    expect(dividirEstoque(12, ["P", "M", "G", "GG"], ["Preta"])).toEqual({ "P|Preta": 3, "M|Preta": 3, "G|Preta": 3, "GG|Preta": 3 });
    expect(dividirEstoque(5, ["P", "M", "G"], ["Preta", "Branca"])).toEqual({
      "P|Preta": 1, "P|Branca": 1, "M|Preta": 1, "M|Branca": 1, "G|Preta": 1, "G|Branca": 0,
    });
  });
  it("a soma é sempre o total, qualquer que seja a divisão", () => {
    for (const total of [0, 1, 7, 100, 99999]) {
      expect(somarEstoque(dividirEstoque(total, ["P", "M", "G"], ["A", "B", "C"]))).toBe(total);
    }
  });
  it("sem combinações não há o que dividir", () => {
    expect(dividirEstoque(5, [], ["Preta"])).toEqual({});
  });
  it("estoqueDaVariacao devolve 0 para combinação que não existe", () => {
    expect(estoqueDaVariacao({ "M|Preta": 4 }, "M", "Preta")).toBe(4);
    expect(estoqueDaVariacao({ "M|Preta": 4 }, "G", "Preta")).toBe(0);
    expect(chaveDaVariacao("M", "Preta")).toBe("M|Preta");
  });
});

// Um banco em memória novo, fora do getDb, para provar a migração em cima de dados já existentes.
function banco() {
  const c = new PGlite();
  const runner: SqlRunner = { exec: (s) => c.exec(s), query: (s, p) => c.query(s, p) };
  return { c, runner };
}
const antes0010 = MIGRATIONS.findIndex((m) => m.id.startsWith("0010"));

describe("migração 0010: estoque por variação", () => {
  async function comProdutoAntigo(stock: number, sizes: string[], colors: string[]) {
    const { c, runner } = banco();
    // Sobe só até a 0009 e cria um produto como era antes (estoque único).
    for (const m of MIGRATIONS.slice(0, antes0010)) await c.exec(m.up);
    await c.exec(
      `INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('pe-um', 'P', 1000, 'Pronta entrega', '${JSON.stringify(sizes)}', '${JSON.stringify(colors)}', ${stock})`,
    );
    await c.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    return { c, runner };
  }

  it("divide o estoque antigo pelas combinações sem mudar o total", async () => {
    const { c } = await comProdutoAntigo(7, ["P", "M", "G"], ["Preta", "Branca"]);
    await c.exec(MIGRATIONS[antes0010].up);
    const linhas = (await c.query("SELECT size, color, stock FROM product_stock WHERE product_slug = 'pe-um' ORDER BY size, color")).rows as { stock: number }[];
    expect(linhas).toHaveLength(6);
    expect(linhas.reduce((a, r) => a + r.stock, 0)).toBe(7);
    expect((await c.query("SELECT stock FROM products WHERE slug = 'pe-um'")).rows).toEqual([{ stock: 7 }]);
  });

  it("o gatilho mantém products.stock igual à soma (inserir, alterar e apagar variações)", async () => {
    const { c } = await comProdutoAntigo(4, ["P", "M"], ["Preta"]);
    await c.exec(MIGRATIONS[antes0010].up);
    const total = async () => ((await c.query("SELECT stock FROM products WHERE slug = 'pe-um'")).rows[0] as { stock: number }).stock;
    expect(await total()).toBe(4);
    await c.exec("UPDATE product_stock SET stock = 10 WHERE product_slug = 'pe-um' AND size = 'P'");
    expect(await total()).toBe(12); // 10 + 2
    await c.exec("INSERT INTO product_stock (product_slug, size, color, stock) VALUES ('pe-um', 'G', 'Preta', 5)");
    expect(await total()).toBe(17);
    await c.exec("DELETE FROM product_stock WHERE product_slug = 'pe-um' AND size = 'G'");
    expect(await total()).toBe(12);
  });

  it("o banco recusa estoque negativo e variação de peça que não existe", async () => {
    const { c } = await comProdutoAntigo(2, ["M"], ["Preta"]);
    await c.exec(MIGRATIONS[antes0010].up);
    await expect(c.exec("UPDATE product_stock SET stock = -1 WHERE product_slug = 'pe-um'")).rejects.toThrow(/product_stock_nao_negativo/);
    await expect(c.exec("INSERT INTO product_stock (product_slug, size, color, stock) VALUES ('nao-existe', 'M', 'Preta', 1)")).rejects.toThrow();
  });

  it("apagar a peça leva as variações junto, sem erro do gatilho", async () => {
    const { c } = await comProdutoAntigo(2, ["M"], ["Preta"]);
    await c.exec(MIGRATIONS[antes0010].up);
    await c.exec("DELETE FROM products WHERE slug = 'pe-um'");
    expect((await c.query("SELECT count(*)::int AS n FROM product_stock")).rows).toEqual([{ n: 0 }]);
  });

  it("descer preserva o total da peça (só some a divisão por variação)", async () => {
    const { c, runner } = banco();
    await runMigrations(runner);
    await c.exec("INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('pe-dois', 'Q', 1000, 'Pronta entrega', '[\"M\"]', '[\"Preta\"]', 0)");
    await c.exec("INSERT INTO product_stock (product_slug, size, color, stock) VALUES ('pe-dois', 'M', 'Preta', 9)");
    await c.exec(MIGRATIONS[antes0010].down!);
    expect((await c.query("SELECT stock FROM products WHERE slug = 'pe-dois'")).rows).toEqual([{ stock: 9 }]);
    expect((await c.query("SELECT to_regclass('product_stock') AS t")).rows).toEqual([{ t: null }]);
  });
});
