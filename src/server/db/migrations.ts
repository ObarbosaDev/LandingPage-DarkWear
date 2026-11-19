// ============================================================================
// Migrações do banco: a lista versionada de mudanças no esquema e o executor que as aplica.
//
// Quem usa: src/server/db/index.ts, a cada conexão nova (subida do servidor), e os testes.
// Por que existe: em produção o banco guarda dados reais. Mudar tabelas "na mão" ou recriar tudo
// seria perigoso. Cada mudança vira uma migração numerada, aplicada UMA vez e registrada na tabela
// schema_migrations, então qualquer ambiente (seu computador, a Vercel) chega ao mesmo estado.
// ============================================================================

import { DDL } from "@/server/db/ddl";

// Migrações versionadas, aplicadas em ordem e uma vez só. O histórico fica na tabela schema_migrations.
//
// Regras para mudar o banco:
//   1. Nunca edite uma migração que já foi aplicada em algum ambiente. Crie uma nova no fim da lista.
//   2. O id é um número crescente seguido de uma descrição curta.
//   3. Atualize também src/server/db/schema.ts, que é o que o código usa para consultar.
//
// Ficam em código (e não em arquivos .sql) para irem junto com o build, sem ler disco em tempo de execução.

/** Uma mudança no banco: um identificador estável e o SQL que a realiza. */
export type Migration = { id: string; sql: string };

export const MIGRATIONS: Migration[] = [
  // O esquema inicial. É idempotente (CREATE ... IF NOT EXISTS), então um banco criado antes de existirem
  // migrações também passa por ela sem perder nada e já entra no histórico.
  { id: "0001_baseline", sql: DDL },
  // Tabela do limite de uso das rotas públicas (src/server/rate-limit.ts): registra cada chamada
  // por origem e tipo. O índice (bucket, key, at) torna rápida a contagem "quantas chamadas esta
  // origem fez nos últimos minutos".
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

// O que o executor precisa do banco. Os dois drivers (Neon e PGlite) cabem aqui: assim o executor
// não depende de nenhum deles e pode ser testado com um banco em memória.
export type SqlRunner = {
  // Roda SQL "solto" (pode ter vários comandos juntos), sem parâmetros.
  exec(sql: string): Promise<unknown>;
  // Roda UM comando com parâmetros ($1, $2...) e devolve as linhas.
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

const LOCK_KEY = 7355608; // qualquer número fixo: impede duas instâncias de migrarem ao mesmo tempo

/**
 * Aplica as migrações que faltam, em ordem.
 *
 * @param db   conexão com o banco (precisa ser UMA conexão só: transação e trava dependem disso)
 * @param list migrações a considerar (padrão: a lista oficial; os testes passam listas próprias)
 * @returns    os ids aplicados NESTA chamada (vazio se o banco já estava em dia)
 */
// Aplica o que falta e devolve os ids aplicados nesta chamada. Cada migração roda na sua transação:
// se uma falha, as anteriores continuam valendo e a que falhou não deixa rastro.
export async function runMigrations(db: SqlRunner, list: Migration[] = MIGRATIONS): Promise<string[]> {
  const aplicadas: string[] = [];
  // Trava do Postgres: se dois servidores sobem juntos (comum na Vercel), o segundo ESPERA o primeiro
  // terminar em vez de tentar criar as mesmas tabelas ao mesmo tempo.
  await db.exec(`SELECT pg_advisory_lock(${LOCK_KEY})`);
  try {
    // A tabela de histórico é criada na primeira vez; nas próximas já existe.
    await db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    // Descobre o que já foi aplicado neste banco.
    const { rows } = await db.query("SELECT id FROM schema_migrations");
    const feitas = new Set(rows.map((r) => String(r.id)));

    for (const m of list) {
      if (feitas.has(m.id)) continue; // já aplicada: pula
      // BEGIN/COMMIT: a migração e o registro dela no histórico valem juntos ou não valem.
      await db.exec("BEGIN");
      try {
        await db.exec(m.sql);
        await db.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await db.exec("COMMIT");
        aplicadas.push(m.id);
      } catch (e) {
        // Desfaz tudo o que esta migração fez e para: as próximas dependem dela.
        await db.exec("ROLLBACK");
        throw new Error(`Migração ${m.id} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    // Sempre solta a trava, para o próximo servidor poder seguir.
    await db.exec(`SELECT pg_advisory_unlock(${LOCK_KEY})`);
  }
  return aplicadas;
}
