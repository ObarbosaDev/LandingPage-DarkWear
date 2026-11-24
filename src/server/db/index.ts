// ============================================================================
// Conexão com o banco de dados (único ponto de entrada: quem precisa do banco chama getDb()).
//
// Quem usa: todo o código de src/server (catálogo, pedidos, painel, login, limite de uso).
// Por que existe: esconder QUAL banco está por trás. Em produção é o Postgres da Neon; no
// computador do desenvolvedor (e nos testes) é um Postgres embutido (PGlite), sem instalar nada.
// Ambos falam SQL igual, então o resto do sistema não sabe a diferença.
// ============================================================================

// Garante que este arquivo NUNCA vá parar no navegador (quebra o build se alguém importar num
// componente de cliente). O banco só existe no servidor.
import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { count } from "drizzle-orm";
// Executor das migrações (cria/atualiza as tabelas ao conectar).
import { prepararBanco } from "@/server/db/migrations";
// Descrição das tabelas, que o Drizzle usa para montar as consultas com tipos.
import * as schema from "@/server/db/schema";
// Catálogo de exemplo, gravado só na primeira execução (banco vazio).
import { PRODUCTS } from "@/server/db/seed-data";

// Tipo comum aos dois bancos. O restante do código usa só este tipo, nunca o driver específico.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Uma conexão por processo, criada sob demanda (nada roda durante o import, então o build não quebra).
// Fica em globalThis: no desenvolvimento, cada recarga de código reavalia este módulo, e uma variável
// local abriria um segundo PGlite na mesma pasta.
const g = globalThis as unknown as { __dwDb?: Promise<Db> | null };

/**
 * Devolve o banco, conectando e migrando na primeira chamada.
 *
 * Guardamos a *promessa* (e não o banco pronto) para que várias chamadas simultâneas, logo na
 * subida do servidor, esperem a MESMA conexão em vez de abrir uma cada.
 */
export function getDb(): Promise<Db> {
  if (!g.__dwDb) {
    g.__dwDb = connect().catch((e) => {
      g.__dwDb = null; // deixa tentar de novo na próxima chamada
      throw e;
    });
  }
  return g.__dwDb;
}

/**
 * Abre a conexão certa para o ambiente, aplica as migrações e carrega o catálogo inicial.
 * Só é chamada por getDb().
 */
async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  // Por padrão o servidor aplica as migrações que faltam ao conectar. Com DB_AUTO_MIGRATE=false ele
  // não mexe no banco: só confere se está em dia (as migrações rodam antes, com "npm run db:migrate").
  const autoMigrar = process.env.DB_AUTO_MIGRATE !== "false";
  let db: Db;

  if (url) {
    // Produção: Postgres (Neon, via Marketplace da Vercel).
    // Imports dinâmicos: o driver da Neon só é carregado quando realmente usado (e o PGlite, que é
    // pesado, nunca entra no pacote de produção).
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const pool = new Pool({ connectionString: url });
    // As migrações precisam de uma conexão só (transação e trava): o Pool reparte as chamadas entre várias.
    const conn = await pool.connect();
    try {
      await prepararBanco({ exec: (sql) => conn.query(sql), query: (sql, params) => conn.query(sql, params) }, autoMigrar);
    } finally {
      // Sempre devolve a conexão ao Pool, mesmo se a migração falhar.
      conn.release();
    }
    db = drizzle({ client: pool, schema }) as unknown as Db;
  } else {
    // Sem DATABASE_URL só é aceitável fora da hospedagem. Na Vercel o disco some a cada execução,
    // então um banco local perderia todos os pedidos: melhor falhar com uma mensagem clara.
    if (process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL não está definida. Provisione o Postgres pelo Marketplace da Vercel (Neon) e conecte ao projeto.",
      );
    }
    // Desenvolvimento local: Postgres embutido (PGlite), gravado em .data/pglite.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
    if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true }); // memory:// vale nos testes
    const client = new PGlite(dir);
    await prepararBanco({ exec: (sql) => client.exec(sql), query: (sql, params) => client.query(sql, params) }, autoMigrar);
    db = drizzle({ client, schema }) as unknown as Db;
  }

  await seedIfEmpty(db);
  return db;
}

/**
 * Primeira execução: carrega o catálogo de exemplo de src/server/db/seed-data.ts.
 * Só grava se a tabela de produtos estiver vazia, então nunca sobrescreve o catálogo real do dono.
 */
async function seedIfEmpty(db: Db) {
  const [row] = await db.select({ n: count() }).from(schema.products);
  if (row.n > 0) return;
  await db.insert(schema.products).values(
    PRODUCTS.map((p, i) => ({
      slug: p.slug,
      name: p.name,
      priceCents: p.priceCents,
      description: p.description,
      category: p.category,
      sizes: p.sizes,
      colors: p.colors,
      stock: p.stock,
      image: p.image ?? null,
      photoBg: p.photoBg ?? null,
      // A posição define a ordem de exibição na loja: segue a ordem do catálogo de exemplo.
      position: i,
    })),
  ).onConflictDoNothing(); // duas partidas simultâneas não derrubam uma à outra
  // O estoque de cada tamanho e cor. O gatilho do banco (migração 0010) acerta o total de cada peça sozinho.
  await db.insert(schema.productStock).values(
    PRODUCTS.flatMap((p) =>
      Object.entries(p.variants).map(([chave, stock]) => {
        const [size, color] = chave.split("|");
        return { productSlug: p.slug, size, color, stock };
      }),
    ),
  ).onConflictDoNothing();
}
