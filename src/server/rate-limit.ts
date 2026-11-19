import "server-only";
import { and, count, eq, gt, lt, lte } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/server/db";
import { rateLimits } from "@/server/db/schema";

// Origem do pedido. Só usamos cabeçalhos que a hospedagem define: o x-forwarded-for puro pode ser
// inventado por quem ataca, e então cada tentativa pareceria vir de um endereço novo.
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-vercel-forwarded-for") || h.get("x-real-ip") || "local";
  return ip.split(",")[0].trim().slice(0, 64);
}

export type RateResult = { allowed: boolean; retryAfterSeconds: number };

// Limite de uso por origem: no máximo `limit` chamadas a cada `windowMs` dentro de um mesmo `bucket`.
// As chamadas ficam no banco, então o limite vale entre todas as instâncias do servidor.
// Cada chamada se registra e vê a sua posição na fila da janela: passam as `limit` primeiras, mesmo
// quando muitas chegam ao mesmo tempo. Chamadas recusadas também ficam na fila, então insistir só
// prolonga a espera.
export async function rateLimit(bucket: string, key: string, limit: number, windowMs: number): Promise<RateResult> {
  const db = await getDb();
  const desde = new Date(Date.now() - windowMs);

  await db.delete(rateLimits).where(and(eq(rateLimits.bucket, bucket), eq(rateLimits.key, key), lt(rateLimits.at, desde)));
  const [minha] = await db.insert(rateLimits).values({ bucket, key }).returning({ id: rateLimits.id });

  const dentro = and(eq(rateLimits.bucket, bucket), eq(rateLimits.key, key), gt(rateLimits.at, desde));
  const [{ posicao }] = await db
    .select({ posicao: count() })
    .from(rateLimits)
    .where(and(dentro, lte(rateLimits.id, minha.id)));
  if (posicao <= limit) return { allowed: true, retryAfterSeconds: 0 };

  // Libera quando a chamada mais antiga da janela sair dela.
  const [antiga] = await db.select({ at: rateLimits.at }).from(rateLimits).where(dentro).orderBy(rateLimits.at).limit(1);
  const espera = antiga ? antiga.at.getTime() + windowMs - Date.now() : windowMs;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(espera / 1000)) };
}
