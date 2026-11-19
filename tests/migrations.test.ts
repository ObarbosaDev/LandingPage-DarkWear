// ============================================================================
// Testes das MIGRAÇÕES DO BANCO (runMigrations em src/server/db/migrations.ts).
// Por que testar: o banco de produção guarda dados reais. Uma migração que apaga dados, roda duas
// vezes ou deixa o banco pela metade seria um desastre.
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, runMigrations, type SqlRunner } from "@/server/db/migrations";

// Um banco em memória novo para cada teste, fora do getDb (que já migra sozinho).
// Devolve ainda dois ajudantes: a lista de tabelas existentes e o histórico de migrações aplicadas.
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
    for (const t of ["products", "orders", "order_items", "custom_orders", "login_attempts", "rate_limits", "order_status_history", "payments", "schema_migrations"]) {
      expect(await tabelas(), t).toContain(t);
    }
  });

  // Reiniciar o servidor roda as migrações de novo: nada pode ser reaplicado.
  it("rodar de novo não aplica nada", async () => {
    const { runner, historico } = novoBanco();
    await runMigrations(runner);
    expect(await runMigrations(runner)).toEqual([]);
    expect(await historico()).toHaveLength(MIGRATIONS.length);
  });

  // Caso real: um banco criado ANTES de existirem migrações (só as tabelas, sem histórico) e que já
  // tem dados. Deve entrar no sistema de migrações sem perder nenhuma linha.
  it("adota um banco criado antes das migrações, sem perder dados", async () => {
    const { c, runner, historico } = novoBanco();
    await c.exec(MIGRATIONS[0].up); // como estava um banco antigo: só as tabelas, sem histórico
    await c.exec(
      "INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('camisa-x', 'X', 1000, 'Pronta entrega', '[\"M\"]', '[\"Preta\"]', 3)",
    );
    const feitas = await runMigrations(runner);
    expect(feitas).toEqual(MIGRATIONS.map((m) => m.id));
    expect((await c.query("SELECT stock FROM products WHERE slug = 'camisa-x'")).rows).toEqual([{ stock: 3 }]);
    expect(await historico()).toHaveLength(MIGRATIONS.length);
  });

  // O caso que mais importa em produção: um banco que JÁ TEM pedidos, criado antes das regras de
  // integridade e do histórico. As migrações novas não podem perder nada, e o histórico dos pedidos
  // antigos deve ser reconstruído (criação + status atual).
  it("atualiza um banco com pedidos existentes e reconstrói o histórico deles", async () => {
    const { c, runner } = novoBanco();
    await runMigrations(runner, MIGRATIONS.slice(0, 2)); // o estado "antigo": só as duas primeiras
    await c.exec(
      "INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('camisa-x', 'X', 1000, 'Pronta entrega', '[\"M\"]', '[\"Preta\"]', 3)",
    );
    await c.exec("INSERT INTO orders (id, status, total_cents) VALUES (1, 'pendente', 1000), (2, 'pago', 2000), (3, 'cancelado', 500)");
    await c.exec(
      "INSERT INTO order_items (order_id, product_slug, name, size, color, qty, unit_price_cents) VALUES (1, 'camisa-x', 'X', 'M', 'Preta', 1, 1000), (2, 'camisa-x', 'X', 'M', 'Preta', 2, 1000)",
    );

    expect(await runMigrations(runner)).toEqual(MIGRATIONS.slice(2).map((m) => m.id));

    // Os dados continuam todos lá.
    expect((await c.query("SELECT count(*)::int AS n FROM orders")).rows).toEqual([{ n: 3 }]);
    expect((await c.query("SELECT count(*)::int AS n FROM order_items")).rows).toEqual([{ n: 2 }]);
    // Histórico reconstruído: todo pedido tem a criação; os que já saíram de "pendente" ganham mais uma linha.
    const linhas = (
      await c.query("SELECT order_id, coalesce(from_status, 'início') AS de, to_status AS para FROM order_status_history ORDER BY order_id, id")
    ).rows;
    expect(linhas).toEqual([
      { order_id: 1, de: "início", para: "pendente" },
      { order_id: 2, de: "início", para: "pendente" },
      { order_id: 2, de: "pendente", para: "pago" },
      { order_id: 3, de: "início", para: "pendente" },
      { order_id: 3, de: "pendente", para: "cancelado" },
    ]);
  });

  // Se o banco antigo já tiver um dado que as regras novas proíbem, a migração deve FALHAR inteira
  // (sem aplicar pela metade), para o problema ser corrigido antes de seguir.
  it("falha sem deixar rastro se o banco antigo tem dado que viola as regras novas", async () => {
    const { c, runner, historico } = novoBanco();
    await runMigrations(runner, MIGRATIONS.slice(0, 2));
    await c.exec(
      "INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('Slug Inválido', 'X', 1000, 'Pronta entrega', '[\"M\"]', '[\"Preta\"]', 3)",
    );
    await expect(runMigrations(runner)).rejects.toThrow(/0003_integridade/);
    expect(await historico()).toEqual(["0001_baseline", "0002_rate_limits"]);
    // Nenhuma regra nova ficou pela metade.
    expect((await c.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'products_categoria'")).rows).toEqual([{ n: 0 }]);
  });

  // Simula um deploy futuro: o banco está na migração 1 e o código novo traz a 2.
  it("aplica só as migrações novas quando já existe histórico", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner, MIGRATIONS.slice(0, 1));
    expect(await runMigrations(runner)).toEqual(MIGRATIONS.slice(1).map((m) => m.id));
  });

  // A 2ª migração cria a tabela "b" e DEPOIS falha. O teste prova três coisas: a "b" é desfeita
  // (a migração é atômica), a 1ª continua valendo e a 3ª nem chega a rodar.
  it("uma migração que falha não deixa rastro, e as anteriores continuam valendo", async () => {
    const { c, runner, historico, tabelas } = novoBanco();
    const lista = [
      { id: "0001_ok", up: "CREATE TABLE a (id int)", down: null },
      { id: "0002_quebrada", up: "CREATE TABLE b (id int); SELECT coluna_que_nao_existe FROM a;", down: null },
      { id: "0003_nunca", up: "CREATE TABLE c (id int)", down: null },
    ];
    await expect(runMigrations(runner, lista)).rejects.toThrow(/0002_quebrada/);
    expect(await historico()).toEqual(["0001_ok"]);
    const t = await tabelas();
    expect(t).toContain("a");
    expect(t).not.toContain("b"); // desfeita junto com a falha
    expect(t).not.toContain("c"); // não chegou a rodar

    // Corrigida a migração, a próxima rodada continua de onde parou.
    lista[1] = { id: "0002_quebrada", up: "CREATE TABLE b (id int)", down: null };
    expect(await runMigrations(runner, lista)).toEqual(["0002_quebrada", "0003_nunca"]);
    await c.close();
  });

  // Proteção contra erro de digitação ao criar uma migração nova: id repetido ou fora de ordem.
  it("os ids são únicos e em ordem crescente", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});
