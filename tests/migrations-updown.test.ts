// ============================================================================
// Testes de SUBIDA E DESCIDA das migrações (src/server/db/migrations.ts): desfazer, status, o
// carimbo (checksum) que detecta migração editada e o modo de subida manual do servidor.
// Por que testar: desfazer mexe em dados reais. Um erro aqui apagaria tabelas de produção, e um
// carimbo que não funciona deixaria uma migração editada passar despercebida.
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  MIGRATIONS,
  checksum,
  migrationStatus,
  prepararBanco,
  rollbackMigrations,
  runMigrations,
  type Migration,
  type SqlRunner,
} from "@/server/db/migrations";

// Um banco em memória novo para cada teste, com ajudantes para olhar o que existe nele.
function novoBanco() {
  const c = new PGlite();
  const runner: SqlRunner = { exec: (s) => c.exec(s), query: (s, p) => c.query(s, p) };
  const tabelas = async () =>
    (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows.map(
      (r) => (r as { table_name: string }).table_name,
    );
  const restricoes = async () =>
    (await c.query("SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace")).rows.map(
      (r) => (r as { conname: string }).conname,
    );
  const historico = async () =>
    (await c.query("SELECT id FROM schema_migrations ORDER BY id")).rows.map((r) => (r as { id: string }).id);
  return { c, runner, tabelas, restricoes, historico };
}

const ids = MIGRATIONS.map((m) => m.id);
// Quantas migrações há da que começa com o prefixo até a última. Os testes descem "até a 0004", por
// exemplo, sem precisar contar de novo toda vez que uma migração nova é criada.
const desde = (prefixo: string) => ids.length - ids.findIndex((i) => i.startsWith(prefixo));

describe("rollbackMigrations (descida)", () => {
  // Por padrão desfaz só a última, deixando as anteriores intactas.
  it("desfaz só a última migração por padrão", async () => {
    const { c, runner, tabelas, historico } = novoBanco();
    await runMigrations(runner);
    const colunasDeClientes = async () =>
      (await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'customers'")).rows.map((r) => (r as { column_name: string }).column_name);
    expect(await colunasDeClientes()).toContain("address_zip");
    expect(await tabelas()).toContain("product_stock");
    expect(await rollbackMigrations(runner)).toEqual([ids.at(-1)]);
    // A última migração (o estoque por variação) saiu, mas o endereço e o papel de administrador das anteriores continuam.
    expect(await tabelas()).not.toContain("product_stock");
    expect(await colunasDeClientes()).toContain("address_zip");
    expect(await colunasDeClientes()).toContain("role");
    expect(await tabelas()).toContain("customers");
    expect(await tabelas()).toContain("product_images");
    // As anteriores continuam: o banco fica no estado exato de antes da última.
    expect(await tabelas()).toContain("order_status_history");
    expect(await tabelas()).toContain("rate_limits");
    expect(await historico()).toEqual(ids.slice(0, -1));
  });

  it("desfaz várias, da mais nova para a mais antiga", async () => {
    const { runner, restricoes, tabelas, historico } = novoBanco();
    await runMigrations(runner);
    expect(await rollbackMigrations(runner, desde("0003"))).toEqual(ids.slice(-desde("0003")).reverse());
    expect(await historico()).toEqual(ids.slice(0, -desde("0003")));
    expect(await tabelas()).not.toContain("order_status_history");
    expect(await tabelas()).not.toContain("payments");
    expect(await tabelas()).not.toContain("product_images");
    expect(await tabelas()).not.toContain("customers");
    // As regras da 0003 saíram junto.
    const r = await restricoes();
    for (const nome of ["products_categoria", "orders_status_valido", "order_items_produto_fk"]) expect(r, nome).not.toContain(nome);
  });

  // A 0001 criou as tabelas da loja: desfazê-la apagaria tudo. O executor tem de recusar.
  it("recusa desfazer a migração irreversível (0001) sem alterar nada", async () => {
    const { runner, historico, tabelas } = novoBanco();
    await runMigrations(runner);
    await expect(rollbackMigrations(runner, ids.length)).rejects.toThrow(/0001_baseline.*irreversível/);
    // Nem as migrações que poderiam ser desfeitas foram tocadas ("tudo ou nada").
    expect(await historico()).toEqual(ids);
    expect(await tabelas()).toContain("order_status_history");
  });

  // O ciclo completo: descer e subir de novo deixa o banco igual ao de antes.
  it("descer e subir de novo preserva os dados da loja", async () => {
    const { c, runner } = novoBanco();
    await runMigrations(runner);
    await c.exec(
      "INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock) VALUES ('camisa-x', 'X', 1000, 'Pronta entrega', '[\"M\"]', '[\"Preta\"]', 3)",
    );
    await c.exec("INSERT INTO orders (status, total_cents) VALUES ('pago', 2000)");
    await c.exec("INSERT INTO order_items (order_id, product_slug, name, size, color, qty, unit_price_cents) VALUES (1, 'camisa-x', 'X', 'M', 'Preta', 2, 1000)");

    await rollbackMigrations(runner, desde("0004")); // desfaz da 0004 (histórico de status) até a última
    expect(await runMigrations(runner)).toEqual(ids.slice(-desde("0004")));

    // Pedido, item e produto continuam, e o histórico foi reconstruído a partir do status atual.
    expect((await c.query("SELECT count(*)::int AS n FROM orders")).rows).toEqual([{ n: 1 }]);
    expect((await c.query("SELECT count(*)::int AS n FROM order_items")).rows).toEqual([{ n: 1 }]);
    expect((await c.query("SELECT stock FROM products WHERE slug = 'camisa-x'")).rows).toEqual([{ stock: 3 }]);
    expect((await c.query("SELECT count(*)::int AS n FROM order_status_history")).rows).toEqual([{ n: 2 }]);
  });

  it("recusa número de passos inválido", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner);
    for (const n of [0, -1, 1.5, NaN]) await expect(rollbackMigrations(runner, n), String(n)).rejects.toThrow(/inteiro/);
  });

  it("sem nada aplicado, não há o que desfazer", async () => {
    const { runner } = novoBanco();
    expect(await rollbackMigrations(runner)).toEqual([]);
  });

  // Toda migração reversível precisa ter um "down" que realmente funcione sobre um banco com tudo aplicado.
  it("o down de cada migração reversível roda sem erro, uma a uma, em ordem", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner);
    for (const m of [...MIGRATIONS].reverse()) {
      if (m.down === null) break;
      expect(await rollbackMigrations(runner), m.id).toEqual([m.id]);
    }
  });
});

describe("migrationStatus", () => {
  it("mostra tudo pendente num banco novo", async () => {
    const { runner } = novoBanco();
    const s = await migrationStatus(runner);
    expect(s.map((e) => e.id)).toEqual(ids);
    expect(s.every((e) => !e.aplicada && e.aplicadaEm === null && !e.alterada)).toBe(true);
  });

  it("mostra o que foi aplicado, a data e quais são reversíveis", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner, MIGRATIONS.slice(0, 2));
    const s = await migrationStatus(runner);
    expect(s.map((e) => e.aplicada)).toEqual([true, true, ...ids.slice(2).map(() => false)]);
    expect(s[0].aplicadaEm).toBeInstanceOf(Date);
    expect(s.map((e) => e.reversivel)).toEqual([false, ...ids.slice(1).map(() => true)]);
  });
});

describe("carimbo (checksum) das migrações", () => {
  // O carimbo é gravado ao aplicar; se o "up" for editado depois, o executor para.
  it("grava o carimbo ao aplicar", async () => {
    const { c, runner } = novoBanco();
    await runMigrations(runner);
    const rows = (await c.query("SELECT id, checksum FROM schema_migrations ORDER BY id")).rows as { id: string; checksum: string }[];
    expect(rows.map((r) => r.checksum)).toEqual(MIGRATIONS.map(checksum));
  });

  it("recusa seguir se uma migração já aplicada foi editada", async () => {
    const { runner } = novoBanco();
    const original: Migration[] = [{ id: "0001_a", up: "CREATE TABLE a (id int)", down: "DROP TABLE a" }];
    await runMigrations(runner, original);
    const editada: Migration[] = [{ id: "0001_a", up: "CREATE TABLE a (id int, extra text)", down: "DROP TABLE a" }];
    await expect(runMigrations(runner, editada)).rejects.toThrow(/0001_a.*alterada/);
    await expect(rollbackMigrations(runner, 1, editada)).rejects.toThrow(/alterada/);
    expect((await migrationStatus(runner, editada))[0].alterada).toBe(true);
  });

  // Editar o "down" não muda o carimbo (só o "up" conta): o down pode ser corrigido a qualquer hora.
  it("editar só o down não é considerado alteração", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner, [{ id: "0001_a", up: "CREATE TABLE a (id int)", down: "DROP TABLE a" }]);
    const outraDescida: Migration[] = [{ id: "0001_a", up: "CREATE TABLE a (id int)", down: "DROP TABLE IF EXISTS a" }];
    expect(await runMigrations(runner, outraDescida)).toEqual([]);
  });

  // Um banco criado antes de o carimbo existir (sem a coluna) deve ser atualizado e carimbado sozinho.
  it("atualiza e carimba um banco criado antes dos carimbos existirem", async () => {
    const { c, runner } = novoBanco();
    await runMigrations(runner);
    // Simula o formato antigo: remove a coluna do carimbo.
    await c.exec("ALTER TABLE schema_migrations DROP COLUMN checksum");
    expect(await runMigrations(runner)).toEqual([]);
    const rows = (await c.query("SELECT checksum FROM schema_migrations ORDER BY id")).rows as { checksum: string }[];
    expect(rows.map((r) => r.checksum)).toEqual(MIGRATIONS.map(checksum));
  });

  it("os carimbos das migrações oficiais são todos diferentes", () => {
    expect(new Set(MIGRATIONS.map(checksum)).size).toBe(MIGRATIONS.length);
  });
});

describe("prepararBanco (subida do servidor)", () => {
  it("no modo automático, aplica o que falta", async () => {
    const { runner, historico } = novoBanco();
    await prepararBanco(runner, true);
    expect(await historico()).toEqual(ids);
  });

  // Modo manual (DB_AUTO_MIGRATE=false): o servidor nunca altera o banco; só confere.
  it("no modo manual, falha com instrução clara se faltam migrações, sem tocar no banco", async () => {
    const { runner, tabelas } = novoBanco();
    await expect(prepararBanco(runner, false)).rejects.toThrow(/Faltam migrações.*npm run db:migrate/);
    expect(await tabelas()).not.toContain("products");
  });

  it("no modo manual, passa quando o banco já está em dia", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner);
    await expect(prepararBanco(runner, false)).resolves.toBeUndefined();
  });

  it("no modo manual, também recusa migração alterada", async () => {
    const { runner } = novoBanco();
    await runMigrations(runner, [{ id: "0001_a", up: "CREATE TABLE a (id int)", down: null }]);
    const editada: Migration[] = [{ id: "0001_a", up: "CREATE TABLE a (id int, x int)", down: null }];
    await expect(prepararBanco(runner, false, editada)).rejects.toThrow(/alterada/);
  });
});
