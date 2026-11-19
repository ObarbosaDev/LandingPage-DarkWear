// ============================================================================
// Migrações do banco: as mudanças no esquema, escritas em arquivos .sql, e o executor que as aplica,
// desfaz e confere.
//
// Onde ficam as migrações: na pasta db/migrations/ (na raiz do projeto), como arquivos SQL comuns,
// dois por migração:
//     0003_integridade.up.sql      a SUBIDA (aplica a mudança)
//     0003_integridade.down.sql    a DESCIDA (desfaz a subida); se não existir, a migração é irreversível
// São SQL puro: dá para abrir, ler, colar no console do Neon e versionar no Git como qualquer arquivo.
//
// Quem usa:
//   - src/server/db/index.ts, a cada conexão nova (subida do servidor);
//   - scripts/db.ts, os comandos "npm run db:status", "db:migrate" e "db:rollback";
//   - os testes.
// Por que existe: em produção o banco guarda dados reais. Mudar tabelas "na mão" ou recriar tudo
// seria perigoso. Cada mudança vira uma migração numerada, aplicada UMA vez e registrada na tabela
// schema_migrations, então qualquer ambiente (seu computador, a Vercel) chega ao mesmo estado.
// ============================================================================

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Regras para mudar o banco:
//   1. Nunca edite uma migração que já foi aplicada em algum ambiente. Crie uma nova no fim.
//      (O executor guarda um checksum de cada "up" e RECUSA seguir se um deles for alterado depois.)
//   2. Crie dois arquivos em db/migrations/: NNNN_descricao.up.sql e NNNN_descricao.down.sql, onde NNNN
//      é o próximo número (4 dígitos) e a descrição usa só letras minúsculas, números e "_".
//   3. Toda migração tem "up" e "down". Se desfazer for perigoso demais (apagaria dados), não crie o
//      arquivo .down.sql: o executor se recusa a desfazê-la.
//   4. Atualize também src/server/db/schema.ts, que é o que o código usa para consultar.
//   5. Rode "npm run db:migrate" (ou suba o servidor, que aplica sozinho por padrão).

/**
 * Uma mudança no banco:
 *   id   identificador estável (número crescente + descrição);
 *   up   o SQL da SUBIDA (aplica a mudança);
 *   down o SQL da DESCIDA (desfaz o up), ou null se a migração for irreversível.
 */
export type Migration = { id: string; up: string; down: string | null };

/** Pasta onde ficam os arquivos .sql das migrações. */
export const PASTA_MIGRACOES = path.join(process.cwd(), "db", "migrations");

// O formato aceito para o nome de cada arquivo: 0003_integridade.up.sql ou 0003_integridade.down.sql.
const NOME_ARQUIVO = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

/**
 * Lê as migrações de uma pasta (por padrão, db/migrations) e valida tudo antes de devolvê-las.
 *
 * Conferências feitas, com erro claro em cada uma:
 *   - todo arquivo .sql segue o padrão de nome;
 *   - todo .down.sql tem o seu .up.sql (descida sem subida é sempre engano);
 *   - nenhum número de migração se repete (duas migrações "0005_..." causariam ordem ambígua).
 *
 * As quebras de linha são normalizadas para "\n": o Git no Windows pode trocar "\n" por "\r\n" ao
 * baixar o projeto, e isso mudaria o carimbo (checksum) sem o SQL ter mudado de fato.
 */
export function carregarMigracoes(pasta: string = PASTA_MIGRACOES): Migration[] {
  let arquivos: string[];
  try {
    // turbopackIgnore: a pasta é uma só e já está incluída pelo outputFileTracingIncludes (next.config.ts);
    // sem isto o Next acharia que a leitura é dinâmica e empacotaria o projeto inteiro.
    arquivos = readdirSync(/* turbopackIgnore: true */ pasta);
  } catch {
    throw new Error(`Pasta de migrações não encontrada: ${pasta}`);
  }

  const ups = new Map<string, string>();
  const downs = new Map<string, string>();
  const numeros = new Map<string, string>(); // número de 4 dígitos -> id (para detectar repetição)

  for (const arquivo of arquivos.filter((a) => a.endsWith(".sql")).sort()) {
    const m = NOME_ARQUIVO.exec(arquivo);
    if (!m) {
      throw new Error(`Nome de arquivo de migração inválido: "${arquivo}". Use o formato 0005_descricao.up.sql e 0005_descricao.down.sql.`);
    }
    const [, numero, descricao, tipo] = m;
    const id = `${numero}_${descricao}`;
    const dono = numeros.get(numero);
    if (dono && dono !== id) throw new Error(`Duas migrações com o mesmo número ${numero}: "${dono}" e "${id}".`);
    numeros.set(numero, id);

    const sql = readFileSync(path.join(/* turbopackIgnore: true */ pasta, arquivo), "utf8").replace(/\r\n/g, "\n");
    (tipo === "up" ? ups : downs).set(id, sql);
  }

  for (const id of downs.keys()) {
    if (!ups.has(id)) throw new Error(`A descida "${id}.down.sql" não tem a subida "${id}.up.sql".`);
  }

  return [...ups.keys()].sort().map((id) => ({ id, up: ups.get(id) as string, down: downs.get(id) ?? null }));
}

/** As migrações oficiais do projeto, lidas de db/migrations/ ao carregar este módulo. */
export const MIGRATIONS: Migration[] = carregarMigracoes();

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
