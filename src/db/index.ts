import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { count } from "drizzle-orm";
import { DDL } from "@/db/ddl";
import * as schema from "@/db/schema";
import { PRODUCTS } from "@/data/products";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Uma conexão por processo, criada sob demanda (nada roda durante o import, então o build não quebra).
// Fica em globalThis: no desenvolvimento, cada recarga de código reavalia este módulo, e uma variável
// local abriria um segundo PGlite na mesma pasta.
const g = globalThis as unknown as { __dwDb?: Promise<Db> | null };

export function getDb(): Promise<Db> {
  if (!g.__dwDb) {
    g.__dwDb = connect().catch((e) => {
      g.__dwDb = null; // deixa tentar de novo na próxima chamada
      throw e;
    });
  }
  return g.__dwDb;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;

  if (url) {
    // Produção: Postgres (Neon, via Marketplace da Vercel).
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const pool = new Pool({ connectionString: url });
    await pool.query(DDL);
    db = drizzle({ client: pool, schema }) as unknown as Db;
  } else {
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
    mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await client.exec(DDL);
    db = drizzle({ client, schema }) as unknown as Db;
  }

  await seedIfEmpty(db);
  return db;
}

// Primeira execução: carrega o catálogo de exemplo de src/data/products.ts.
async function seedIfEmpty(db: Db) {
  const [row] = await db.select({ n: count() }).from(schema.products);
  if (row.n > 0) return;
  await db.insert(schema.products).values(
    PRODUCTS.map((p, i) => ({
      slug: p.slug,
      name: p.name,
      priceCents: Math.round(p.price * 100),
      description: p.description,
      category: p.category,
      sizes: p.sizes,
      colors: p.colors,
      stock: p.stock,
      image: p.image ?? null,
      photoBg: p.photoBg ?? null,
      position: i,
    })),
  ).onConflictDoNothing(); // duas partidas simultâneas não derrubam uma à outra
}
