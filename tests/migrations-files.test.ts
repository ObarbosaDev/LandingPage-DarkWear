// ============================================================================
// Testes do CARREGADOR de migrações em arquivos .sql (carregarMigracoes em src/server/db/migrations.ts).
// Por que testar: as migrações agora são arquivos soltos numa pasta. Um nome errado, uma descida sem
// subida ou dois arquivos com o mesmo número não podem passar em silêncio.
// ============================================================================

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, carregarMigracoes, checksum } from "@/server/db/migrations";

/** Cria uma pasta temporária com os arquivos informados (nome -> conteúdo) e devolve o caminho. */
function pastaCom(arquivos: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "migracoes-"));
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(path.join(dir, nome), conteudo);
  return dir;
}

describe("carregarMigracoes", () => {
  it("lê subida e descida de cada migração, em ordem", () => {
    const dir = pastaCom({
      "0002_b.up.sql": "CREATE TABLE b (id int);",
      "0002_b.down.sql": "DROP TABLE b;",
      "0001_a.up.sql": "CREATE TABLE a (id int);",
    });
    expect(carregarMigracoes(dir)).toEqual([
      { id: "0001_a", up: "CREATE TABLE a (id int);", down: null },
      { id: "0002_b", up: "CREATE TABLE b (id int);", down: "DROP TABLE b;" },
    ]);
  });

  // Sem o arquivo .down.sql a migração é irreversível (é assim que a 0001 é marcada).
  it("migração sem arquivo .down.sql é irreversível (down null)", () => {
    const [m] = carregarMigracoes(pastaCom({ "0001_a.up.sql": "SELECT 1;" }));
    expect(m.down).toBeNull();
  });

  it("recusa nome de arquivo fora do padrão", () => {
    for (const nome of ["1_a.up.sql", "0001_A.up.sql", "0001_a.sql", "0001_a.subir.sql", "0001-a.up.sql", "0001_.up.sql"]) {
      expect(() => carregarMigracoes(pastaCom({ [nome]: "SELECT 1;" })), nome).toThrow(/Nome de arquivo de migração inválido/);
    }
  });

  it("recusa descida sem subida", () => {
    expect(() => carregarMigracoes(pastaCom({ "0001_a.down.sql": "DROP TABLE a;" }))).toThrow(/não tem a subida/);
  });

  // Duas migrações "0005_..." teriam ordem ambígua: erro claro em vez de escolher uma ao acaso.
  it("recusa dois arquivos com o mesmo número", () => {
    const dir = pastaCom({ "0005_a.up.sql": "SELECT 1;", "0005_b.up.sql": "SELECT 2;" });
    expect(() => carregarMigracoes(dir)).toThrow(/mesmo número 0005/);
  });

  it("recusa pasta que não existe", () => {
    expect(() => carregarMigracoes(path.join(tmpdir(), "nao-existe-migracoes-xyz"))).toThrow(/Pasta de migrações não encontrada/);
  });

  it("ignora arquivos que não são .sql (como o .gitattributes da pasta)", () => {
    const dir = pastaCom({ "0001_a.up.sql": "SELECT 1;", ".gitattributes": "*.sql text eol=lf", "LEIAME.txt": "x" });
    expect(carregarMigracoes(dir)).toHaveLength(1);
  });

  // O Git no Windows pode converter \n em \r\n ao baixar o projeto. O carimbo não pode mudar por isso.
  it("normaliza quebras de linha: CRLF e LF dão o mesmo SQL e o mesmo carimbo", () => {
    const lf = carregarMigracoes(pastaCom({ "0001_a.up.sql": "CREATE TABLE a (\n  id int\n);\n" }))[0];
    const crlf = carregarMigracoes(pastaCom({ "0001_a.up.sql": "CREATE TABLE a (\r\n  id int\r\n);\r\n" }))[0];
    expect(crlf.up).toBe(lf.up);
    expect(checksum(crlf)).toBe(checksum(lf));
  });

  it("subpastas não são lidas", () => {
    const dir = pastaCom({ "0001_a.up.sql": "SELECT 1;" });
    mkdirSync(path.join(dir, "antigas"));
    writeFileSync(path.join(dir, "antigas", "0009_x.up.sql"), "SELECT 9;");
    expect(carregarMigracoes(dir).map((m) => m.id)).toEqual(["0001_a"]);
  });
});

describe("migrações oficiais (pasta db/migrations)", () => {
  it("a lista oficial tem as migrações esperadas, em ordem, e só a 0001 é irreversível", () => {
    expect(MIGRATIONS.map((m) => m.id)).toEqual([...MIGRATIONS.map((m) => m.id)].sort());
    expect(MIGRATIONS.filter((m) => m.down === null).map((m) => m.id)).toEqual(["0001_baseline"]);
  });

  it("nenhuma migração oficial está vazia", () => {
    for (const m of MIGRATIONS) {
      expect(m.up.trim().length, `${m.id}.up.sql está vazio`).toBeGreaterThan(0);
      if (m.down !== null) expect(m.down.trim().length, `${m.id}.down.sql está vazio`).toBeGreaterThan(0);
    }
  });
});
