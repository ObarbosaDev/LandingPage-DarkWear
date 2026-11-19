import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { DDL } from "@/server/db/ddl";
import { MIGRATIONS, runMigrations, type SqlRunner } from "@/server/db/migrations";

// Um banco em memória novo para cada teste, fora do getDb (que já migra sozinho).
function novoBanco() {
  const c = new PGlite();
  const runner: SqlRunner = { exec: (s) => c.exec(s), query: (s, p) => c.query(s, p) };
  const tabelas = async () =>
    (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows.map(
      (r) => (r as { table_name: string }).table_name,
    );
  const historico = async () =>
    (await c.query("SELECT id FROM schema_migrations ORDER BY id")).rows.map((r) => (r as { id: string }).id);
  return { c, runner, tabelas, historico };
}

describe("runMigrations", () => {
  it("cria o esquema inteiro num banco novo e registra o histórico", async () => {
    const { runner, tabelas, historico } = novoBanco();
    const feitas = await runMigrations(runner);
    expect(feitas).toEqual(MIGRATIONS.map((m) => m.id));
    expect(await historico()).toEqual(MIGRATIONS.map((m) => m.id));
    for (const t of ["products", "orders", "order_items", "custom_orders", "login_attempts", "rate_limits", "schema_migrations"]) {
      expect(await tabelas(), t).toContain(t);
    }
  });

  it("rodar de novo não aplica nada", async () => {
    const { runner, historico } = novoBanco();
    await runMigrations(runner);
    expect(await runMigrations(runner)).toEqual([]);
    expect(await historico()).toHaveLength(MIGRATIONS.length);
  });

  it("adota um banco criado antes das migrações, sem perder dados", async () => {
    const { c, runner, historico } = novoBanco();
    await c.exec(DDL); // como estava um banco antigo: só as tabelas, sem histórico
    await c.exec(
      "INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('x', 'X', 1000, 'Pronta entrega', '[\"M\"]', '[\"Preta\"]', 3)",
    );
    const feitas = await runMigrations(runner);
    expect(feitas).toEqual(MIGRATIONS.map((m) => m.id));
    expect((await c.query("SELECT stock FROM products WHERE slug = 'x'")).rows).toEqual([{ stock: 3 }]);
    expect(await historico()).toHaveLength(MIGRATIONS.length);
  });

  it("aplica só as migrações novas quando já existe histórico", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner, MIGRATIONS.slice(0, 1));
    expect(await runMigrations(runner)).toEqual(MIGRATIONS.slice(1).map((m) => m.id));
  });

  it("uma migração que falha não deixa rastro, e as anteriores continuam valendo", async () => {
    const { c, runner, historico, tabelas } = novoBanco();
    const lista = [
      { id: "0001_ok", sql: "CREATE TABLE a (id int)" },
      { id: "0002_quebrada", sql: "CREATE TABLE b (id int); SELECT coluna_que_nao_existe FROM a;" },
      { id: "0003_nunca", sql: "CREATE TABLE c (id int)" },
    ];
    await expect(runMigrations(runner, lista)).rejects.toThrow(/0002_quebrada/);
    expect(await historico()).toEqual(["0001_ok"]);
    const t = await tabelas();
    expect(t).toContain("a");
    expect(t).not.toContain("b"); // desfeita junto com a falha
    expect(t).not.toContain("c"); // não chegou a rodar

    // Corrigida a migração, a próxima rodada continua de onde parou.
    lista[1] = { id: "0002_quebrada", sql: "CREATE TABLE b (id int)" };
    expect(await runMigrations(runner, lista)).toEqual(["0002_quebrada", "0003_nunca"]);
    await c.close();
  });

  it("os ids são únicos e em ordem crescente", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});
