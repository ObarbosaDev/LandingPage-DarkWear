// ============================================================================
// Migrações do banco: a lista versionada de mudanças no esquema (cada uma com a SUBIDA e a DESCIDA)
// e o executor que as aplica, desfaz e confere.
//
// Quem usa:
//   - src/server/db/index.ts, a cada conexão nova (subida do servidor);
//   - scripts/db.ts, os comandos "npm run db:status", "db:migrate" e "db:rollback";
//   - os testes.
// Por que existe: em produção o banco guarda dados reais. Mudar tabelas "na mão" ou recriar tudo
// seria perigoso. Cada mudança vira uma migração numerada, aplicada UMA vez e registrada na tabela
// schema_migrations, então qualquer ambiente (seu computador, a Vercel) chega ao mesmo estado.
// ============================================================================

import { createHash } from "node:crypto";
import { DDL } from "@/server/db/ddl";

// Migrações versionadas, aplicadas em ordem e uma vez só. O histórico fica na tabela schema_migrations.
//
// Regras para mudar o banco:
//   1. Nunca edite uma migração que já foi aplicada em algum ambiente. Crie uma nova no fim da lista.
//      (O executor guarda um checksum de cada "up" e RECUSA seguir se um deles for alterado depois.)
//   2. O id é um número crescente seguido de uma descrição curta.
//   3. Toda migração tem "up" (a subida) e "down" (a descida, que desfaz o "up"). Se desfazer for
//      perigoso demais (apagaria dados), use down: null: o executor se recusa a desfazê-la.
//   4. Atualize também src/server/db/schema.ts, que é o que o código usa para consultar.
//
// Ficam em código (e não em arquivos .sql) para irem junto com o build, sem ler disco em tempo de execução.

/**
 * Uma mudança no banco:
 *   id   identificador estável (número crescente + descrição);
 *   up   o SQL da SUBIDA (aplica a mudança);
 *   down o SQL da DESCIDA (desfaz o up), ou null se a migração for irreversível.
 */
export type Migration = { id: string; up: string; down: string | null };

export const MIGRATIONS: Migration[] = [
  // O esquema inicial. É idempotente (CREATE ... IF NOT EXISTS), então um banco criado antes de existirem
  // migrações também passa por ela sem perder nada e já entra no histórico.
  // Irreversível (down: null): desfazê-la apagaria todas as tabelas e todos os dados da loja.
  { id: "0001_baseline", up: DDL, down: null },
  // Tabela do limite de uso das rotas públicas (src/server/rate-limit.ts): registra cada chamada
  // por origem e tipo. O índice (bucket, key, at) torna rápida a contagem "quantas chamadas esta
  // origem fez nos últimos minutos".
  {
    id: "0002_rate_limits",
    up: `
CREATE TABLE IF NOT EXISTS rate_limits (
  id serial PRIMARY KEY,
  bucket text NOT NULL,
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_idx ON rate_limits (bucket, key, at);
`,
    // Descer apaga a tabela e a contagem de chamadas (que são temporárias; não há dado valioso).
    down: `DROP TABLE IF EXISTS rate_limits;`,
  },
  // Integridade: o banco passa a RECUSAR dado inválido, mesmo que um bug ou um script tente gravá-lo.
  //   - CHECK em status, categoria, endereço (slug), tamanhos/cores (listas de 1 a 12 itens) e foto;
  //   - chave estrangeira: um item de pedido só pode apontar para uma peça que existe, e uma peça com
  //     pedidos não pode ser apagada (ON DELETE RESTRICT);
  //   - gatilho que atualiza updated_at sozinho a cada alteração (não depende do código lembrar);
  //   - índices para as consultas do painel e do cron, que ficam lentas quando há muitos pedidos.
  {
    id: "0003_integridade",
    up: `
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
    // Descer remove só as REGRAS (checks, chave estrangeira, gatilhos e índices novos); nenhum dado
    // é apagado. O índice antigo de status volta, como estava antes da migração.
    down: `
DROP INDEX IF EXISTS custom_orders_status_created_idx;
DROP INDEX IF EXISTS order_items_produto_idx;
DROP INDEX IF EXISTS products_vitrine_idx;
DROP INDEX IF EXISTS orders_pendentes_idx;
DROP INDEX IF EXISTS orders_status_created_idx;
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
DROP TRIGGER IF EXISTS products_set_updated_at ON products;
DROP FUNCTION IF EXISTS set_updated_at();

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_produto_fk,
  DROP CONSTRAINT IF EXISTS order_items_qty_limite;
ALTER TABLE custom_orders DROP CONSTRAINT IF EXISTS custom_orders_status_valido;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_valido;
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_foto_caminho,
  DROP CONSTRAINT IF EXISTS products_cores_lista,
  DROP CONSTRAINT IF EXISTS products_tamanhos_lista,
  DROP CONSTRAINT IF EXISTS products_foto_fundo,
  DROP CONSTRAINT IF EXISTS products_categoria,
  DROP CONSTRAINT IF EXISTS products_nome_tamanho,
  DROP CONSTRAINT IF EXISTS products_slug_formato;
`,
  },
  // Histórico de status: uma linha a cada mudança de status de um pedido (de, para, quando e por quem).
  // Responde "quando foi pago?" e "quem cancelou, o painel ou a expiração?". Pedidos que já existiam
  // ganham um histórico reconstruído a partir do que o banco sabe (criação e status atual).
  {
    id: "0004_historico_de_status",
    up: `
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
    // Descer apaga o histórico (os pedidos em si ficam). Se subir de novo, o histórico é reconstruído
    // só com a criação e o status atual: o detalhe de cada mudança intermediária se perde.
    down: `DROP TABLE IF EXISTS order_status_history;`,
  },
  // Pagamentos online (Mercado Pago): uma linha por tentativa/pagamento de um pedido.
  //   - status normalizado do pagamento (iniciado, pendente, aprovado, recusado, cancelado, estornado);
  //   - provider_payment_id é ÚNICO: o mesmo aviso do Mercado Pago chegando duas vezes (acontece
  //     por causa das reentregas) cai na mesma linha, e o pedido nunca é "pago" duas vezes;
  //   - o histórico de status passa a aceitar a origem "pagamento" (pedido pago pelo webhook).
  {
    id: "0005_pagamentos",
    up: `
CREATE TABLE payments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('mercadopago')),
  preference_id text,
  provider_payment_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('iniciado', 'pendente', 'aprovado', 'recusado', 'cancelado', 'estornado')),
  method text,
  installments integer CHECK (installments IS NULL OR installments BETWEEN 1 AND 36),
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_preference_idx ON payments (preference_id);
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_origin_check;
ALTER TABLE order_status_history
  ADD CONSTRAINT order_status_history_origin_check CHECK (origin IN ('pedido', 'painel', 'expiracao', 'pagamento'));
`,
    // Descer APAGA a tabela de pagamentos (os registros de quem pagou o quê). Por isso exige --confirm.
    // As linhas de histórico criadas pelo webhook passam a constar como feitas pelo painel.
    down: `
UPDATE order_status_history SET origin = 'painel' WHERE origin = 'pagamento';
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_origin_check;
ALTER TABLE order_status_history
  ADD CONSTRAINT order_status_history_origin_check CHECK (origin IN ('pedido', 'painel', 'expiracao'));
DROP TABLE IF EXISTS payments;
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
 * O "carimbo" de uma migração: um resumo (SHA-256) do SQL da subida.
 * Guardado no banco no momento em que a migração é aplicada. Se alguém editar o "up" depois, o
 * carimbo deixa de bater e o executor se recusa a seguir (ver conferirCarimbos).
 */
export const checksum = (m: Migration): string => createHash("sha256").update(m.up).digest("hex");

/** O estado de cada migração da lista, como mostrado por "npm run db:status". */
export type MigrationState = {
  id: string;
  /** true se já foi aplicada neste banco. */
  aplicada: boolean;
  /** Quando foi aplicada (null se ainda pendente). */
  aplicadaEm: Date | null;
  /** true se o "up" foi alterado depois de aplicado (o carimbo gravado não bate com o do código). */
  alterada: boolean;
  /** true se dá para desfazê-la (tem "down"). */
  reversivel: boolean;
};

/**
 * Roda uma tarefa de migração com a trava do Postgres, para dois servidores (ou um servidor e o
 * comando db:migrate) não migrarem ao mesmo tempo: o segundo ESPERA o primeiro terminar.
 */
async function comTrava<T>(db: SqlRunner, tarefa: () => Promise<T>): Promise<T> {
  await db.exec(`SELECT pg_advisory_lock(${LOCK_KEY})`);
  try {
    return await tarefa();
  } finally {
    // Sempre solta a trava, para o próximo poder seguir.
    await db.exec(`SELECT pg_advisory_unlock(${LOCK_KEY})`);
  }
}

/**
 * Garante que a tabela de histórico existe e tem a coluna do carimbo.
 * A coluna "checksum" foi acrescentada depois da primeira versão; "ADD COLUMN IF NOT EXISTS" faz
 * bancos criados antes dela serem atualizados sozinhos.
 */
async function prepararHistorico(db: SqlRunner): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.exec("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
}

/** Lê do banco o que já foi aplicado (id, carimbo e data). */
async function lerAplicadas(db: SqlRunner): Promise<Map<string, { checksum: string | null; aplicadaEm: Date }>> {
  const { rows } = await db.query("SELECT id, checksum, applied_at FROM schema_migrations");
  return new Map(
    rows.map((r) => [
      String(r.id),
      { checksum: r.checksum === null ? null : String(r.checksum), aplicadaEm: new Date(r.applied_at as string | Date) },
    ]),
  );
}

/**
 * Confere os carimbos das migrações já aplicadas.
 * - Carimbo diferente do código = alguém editou uma migração depois de aplicada: ERRO (o banco e o
 *   código teriam histórias diferentes). A correção é desfazer a edição e criar uma migração nova.
 * - Sem carimbo (banco criado antes dos carimbos existirem) = grava agora o do código atual.
 */
async function conferirCarimbos(
  db: SqlRunner,
  lista: Migration[],
  aplicadas: Map<string, { checksum: string | null }>,
): Promise<void> {
  for (const m of lista) {
    const a = aplicadas.get(m.id);
    if (!a) continue;
    const atual = checksum(m);
    if (a.checksum === null) {
      await db.query("UPDATE schema_migrations SET checksum = $1 WHERE id = $2", [atual, m.id]);
    } else if (a.checksum !== atual) {
      throw new Error(
        `A migração ${m.id} foi alterada depois de aplicada neste banco. Desfaça a edição e crie uma migração nova no fim da lista.`,
      );
    }
  }
}

/**
 * Aplica as migrações que faltam (as SUBIDAS), em ordem.
 *
 * @param db   conexão com o banco (precisa ser UMA conexão só: transação e trava dependem disso)
 * @param list migrações a considerar (padrão: a lista oficial; os testes passam listas próprias)
 * @returns    os ids aplicados NESTA chamada (vazio se o banco já estava em dia)
 */
// Aplica o que falta e devolve os ids aplicados nesta chamada. Cada migração roda na sua transação:
// se uma falha, as anteriores continuam valendo e a que falhou não deixa rastro.
export async function runMigrations(db: SqlRunner, list: Migration[] = MIGRATIONS): Promise<string[]> {
  return comTrava(db, async () => {
    const aplicadasAgora: string[] = [];
    await prepararHistorico(db);
    const feitas = await lerAplicadas(db);
    await conferirCarimbos(db, list, feitas);

    for (const m of list) {
      if (feitas.has(m.id)) continue; // já aplicada: pula
      // BEGIN/COMMIT: a migração e o registro dela no histórico valem juntos ou não valem.
      await db.exec("BEGIN");
      try {
        await db.exec(m.up);
        await db.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [m.id, checksum(m)]);
        await db.exec("COMMIT");
        aplicadasAgora.push(m.id);
      } catch (e) {
        // Desfaz tudo o que esta migração fez e para: as próximas dependem dela.
        await db.exec("ROLLBACK");
        throw new Error(`Migração ${m.id} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return aplicadasAgora;
  });
}

/**
 * Desfaz as últimas migrações aplicadas (as DESCIDAS), da mais recente para a mais antiga.
 *
 * ATENÇÃO: descer pode apagar dados (por exemplo, desfazer o histórico de status apaga a tabela dele).
 * Por isso o comando "npm run db:rollback" pede confirmação explícita.
 *
 * Antes de mexer em qualquer coisa, confere se TODAS as migrações a desfazer são reversíveis: ou
 * desfaz todas, ou nenhuma.
 *
 * @param passos quantas migrações desfazer (padrão: só a última)
 * @returns      os ids desfeitos, na ordem em que foram desfeitos
 */
export async function rollbackMigrations(db: SqlRunner, passos = 1, list: Migration[] = MIGRATIONS): Promise<string[]> {
  if (!Number.isInteger(passos) || passos < 1) throw new Error("O número de migrações a desfazer precisa ser um inteiro de 1 em diante.");
  return comTrava(db, async () => {
    await prepararHistorico(db);
    const feitas = await lerAplicadas(db);
    await conferirCarimbos(db, list, feitas);

    // As aplicadas, da mais nova para a mais antiga; pega as `passos` primeiras.
    const alvo = [...list].filter((m) => feitas.has(m.id)).reverse().slice(0, passos);
    const irreversivel = alvo.find((m) => m.down === null);
    if (irreversivel) {
      throw new Error(`A migração ${irreversivel.id} é irreversível: desfazê-la apagaria todos os dados. Nada foi alterado.`);
    }

    const desfeitas: string[] = [];
    for (const m of alvo) {
      await db.exec("BEGIN");
      try {
        await db.exec(m.down as string);
        await db.query("DELETE FROM schema_migrations WHERE id = $1", [m.id]);
        await db.exec("COMMIT");
        desfeitas.push(m.id);
      } catch (e) {
        await db.exec("ROLLBACK");
        throw new Error(`Ao desfazer a migração ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return desfeitas;
  });
}

/**
 * Situação de cada migração da lista neste banco (aplicada ou pendente, alterada ou não).
 * Não altera nada além de criar a tabela de histórico, se ainda não existir.
 */
export async function migrationStatus(db: SqlRunner, list: Migration[] = MIGRATIONS): Promise<MigrationState[]> {
  await prepararHistorico(db);
  const feitas = await lerAplicadas(db);
  return list.map((m) => {
    const a = feitas.get(m.id);
    return {
      id: m.id,
      aplicada: Boolean(a),
      aplicadaEm: a ? a.aplicadaEm : null,
      alterada: Boolean(a && a.checksum !== null && a.checksum !== checksum(m)),
      reversivel: m.down !== null,
    };
  });
}

/**
 * O que o servidor faz com as migrações ao conectar:
 *   - automático (padrão): aplica o que falta, como sempre;
 *   - manual (DB_AUTO_MIGRATE=false): NÃO mexe no banco; só confere se está em dia e, se faltar
 *     migração, falha com uma mensagem clara. É o modo para produção com deploy controlado: as
 *     migrações rodam antes, com "npm run db:migrate", e o servidor nunca altera o banco sozinho.
 */
export async function prepararBanco(db: SqlRunner, automatico: boolean, list: Migration[] = MIGRATIONS): Promise<void> {
  if (automatico) {
    await runMigrations(db, list);
    return;
  }
  const estado = await migrationStatus(db, list);
  const pendentes = estado.filter((e) => !e.aplicada).map((e) => e.id);
  if (pendentes.length > 0) {
    throw new Error(`Faltam migrações neste banco: ${pendentes.join(", ")}. Rode "npm run db:migrate" antes de subir o servidor.`);
  }
  const alterada = estado.find((e) => e.alterada);
  if (alterada) throw new Error(`A migração ${alterada.id} foi alterada depois de aplicada neste banco.`);
}
