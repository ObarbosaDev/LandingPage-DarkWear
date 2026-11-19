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
  // Integridade: o banco passa a RECUSAR dado inválido, mesmo que um bug ou um script tente gravá-lo.
  //   - CHECK em status, categoria, endereço (slug), tamanhos/cores (listas de 1 a 12 itens) e foto;
  //   - chave estrangeira: um item de pedido só pode apontar para uma peça que existe, e uma peça com
  //     pedidos não pode ser apagada (ON DELETE RESTRICT);
  //   - gatilho que atualiza updated_at sozinho a cada alteração (não depende do código lembrar);
  //   - índices para as consultas do painel e do cron, que ficam lentas quando há muitos pedidos.
  {
    id: "0003_integridade",
    sql: `
ALTER TABLE products
  ADD CONSTRAINT products_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60),
  ADD CONSTRAINT products_nome_tamanho CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT products_categoria CHECK (category IN ('Pronta entrega', 'Coleção')),
  ADD CONSTRAINT products_foto_fundo CHECK (photo_bg IS NULL OR photo_bg IN ('light', 'dark')),
  ADD CONSTRAINT products_tamanhos_lista CHECK (jsonb_typeof(sizes) = 'array' AND jsonb_array_length(sizes) BETWEEN 1 AND 12),
  ADD CONSTRAINT products_cores_lista CHECK (jsonb_typeof(colors) = 'array' AND jsonb_array_length(colors) BETWEEN 1 AND 12),
  ADD CONSTRAINT products_foto_caminho CHECK (image IS NULL OR image ~ '^/products/[A-Za-z0-9_.-]+$');

ALTER TABLE orders
  ADD CONSTRAINT orders_status_valido CHECK (status IN ('pendente', 'pago', 'enviado', 'entregue', 'cancelado'));

ALTER TABLE custom_orders
  ADD CONSTRAINT custom_orders_status_valido CHECK (status IN ('novo', 'em contato', 'produzindo', 'concluído', 'cancelado'));

ALTER TABLE order_items
  ADD CONSTRAINT order_items_qty_limite CHECK (qty <= 99),
  ADD CONSTRAINT order_items_produto_fk FOREIGN KEY (product_slug) REFERENCES products (slug) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP INDEX IF EXISTS orders_status_idx;
CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX orders_pendentes_idx ON orders (created_at) WHERE status = 'pendente';
CREATE INDEX products_vitrine_idx ON products (position, created_at) WHERE active;
CREATE INDEX order_items_produto_idx ON order_items (product_slug);
CREATE INDEX custom_orders_status_created_idx ON custom_orders (status, created_at DESC);
`,
  },
  // Histórico de status: uma linha a cada mudança de status de um pedido (de, para, quando e por quem).
  // Responde "quando foi pago?" e "quem cancelou, o painel ou a expiração?". Pedidos que já existiam
  // ganham um histórico reconstruído a partir do que o banco sabe (criação e status atual).
  {
    id: "0004_historico_de_status",
    sql: `
CREATE TABLE order_status_history (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('pendente', 'pago', 'enviado', 'entregue', 'cancelado')),
  origin text NOT NULL CHECK (origin IN ('pedido', 'painel', 'expiracao')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, at);

INSERT INTO order_status_history (order_id, from_status, to_status, origin, at)
  SELECT id, NULL, 'pendente', 'pedido', created_at FROM orders;
INSERT INTO order_status_history (order_id, from_status, to_status, origin, at)
  SELECT id, 'pendente', status, 'painel', updated_at FROM orders WHERE status <> 'pendente';
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
