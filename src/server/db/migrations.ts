import { DDL } from "@/server/db/ddl";

// Migrações versionadas, aplicadas em ordem e uma vez só. O histórico fica na tabela schema_migrations.
//
// Regras para mudar o banco:
//   1. Nunca edite uma migração que já foi aplicada em algum ambiente. Crie uma nova no fim da lista.
//   2. O id é um número crescente seguido de uma descrição curta.
//   3. Atualize também src/server/db/schema.ts, que é o que o código usa para consultar.
//
// Ficam em código (e não em arquivos .sql) para irem junto com o build, sem ler disco em tempo de execução.

export type Migration = { id: string; sql: string };

export const MIGRATIONS: Migration[] = [
  // O esquema inicial. É idempotente (CREATE ... IF NOT EXISTS), então um banco criado antes de existirem
  // migrações também passa por ela sem perder nada e já entra no histórico.
  { id: "0001_baseline", sql: DDL },
  {
    id: "0002_rate_limits",
    sql: `
CREATE TABLE IF NOT EXISTS rate_limits (
  id serial PRIMARY KEY,
  bucket text NOT NULL,
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_idx ON rate_limits (bucket, key, at);
`,
  },
];

// O que o executor precisa do banco. Os dois drivers (Neon e PGlite) cabem aqui.
export type SqlRunner = {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

const LOCK_KEY = 7355608; // qualquer número fixo: impede duas instâncias de migrarem ao mesmo tempo

// Aplica o que falta e devolve os ids aplicados nesta chamada. Cada migração roda na sua transação:
// se uma falha, as anteriores continuam valendo e a que falhou não deixa rastro.
export async function runMigrations(db: SqlRunner, list: Migration[] = MIGRATIONS): Promise<string[]> {
  const aplicadas: string[] = [];
  await db.exec(`SELECT pg_advisory_lock(${LOCK_KEY})`);
  try {
    await db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await db.query("SELECT id FROM schema_migrations");
    const feitas = new Set(rows.map((r) => String(r.id)));

    for (const m of list) {
      if (feitas.has(m.id)) continue;
      await db.exec("BEGIN");
      try {
        await db.exec(m.sql);
        await db.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await db.exec("COMMIT");
        aplicadas.push(m.id);
      } catch (e) {
        await db.exec("ROLLBACK");
        throw new Error(`Migração ${m.id} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await db.exec(`SELECT pg_advisory_unlock(${LOCK_KEY})`);
  }
  return aplicadas;
}
