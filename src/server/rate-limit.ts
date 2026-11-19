// ============================================================================
// Limite de uso: impede que uma mesma origem faça pedidos em excesso.
//
// Quem usa: POST /api/orders (10 por 10 min) e POST /api/custom-orders (5 por 10 min).
// Por que existe: sem isso, um script poderia criar pedidos falsos em série e esgotar o estoque
// inteiro (cada pedido pendente segura as peças). O limite é por "origem" (endereço de quem chama).
// ============================================================================

import "server-only";
import { and, count, eq, gt, lt, lte } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/server/db";
import { rateLimits } from "@/server/db/schema";

/**
 * Identifica quem está chamando, para o limite ser aplicado por origem.
 * Também usada pelo login do painel (src/app/admin/actions.ts).
 */
// Origem do pedido. Só usamos cabeçalhos que a hospedagem define: o x-forwarded-for puro pode ser
// inventado por quem ataca, e então cada tentativa pareceria vir de um endereço novo.
export async function clientKey(): Promise<string> {
  const h = await headers();
  // 1º cabeçalho da Vercel (confiável); 2º cabeçalho de proxy comum; sem nenhum, "local"
  // (desenvolvimento no próprio computador: todos compartilham a mesma conta).
  const ip = h.get("x-vercel-forwarded-for") || h.get("x-real-ip") || "local";
  // Pega só o primeiro endereço de uma lista e limita o tamanho (a chave vai para o banco).
  return ip.split(",")[0].trim().slice(0, 64);
}

/** Resultado do limite: se pode seguir e, se não puder, em quantos segundos tentar de novo. */
export type RateResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Registra uma chamada e diz se ela cabe no limite.
 *
 * @param bucket   tipo da chamada ("orders", "custom-orders"): cada tipo tem a sua própria conta
 * @param key      origem de quem chama (ver clientKey)
 * @param limit    máximo de chamadas permitidas na janela
 * @param windowMs tamanho da janela, em milissegundos
 */
// Limite de uso por origem: no máximo `limit` chamadas a cada `windowMs` dentro de um mesmo `bucket`.
// As chamadas ficam no banco, então o limite vale entre todas as instâncias do servidor.
// Cada chamada se registra e vê a sua posição na fila da janela: passam as `limit` primeiras, mesmo
// quando muitas chegam ao mesmo tempo. Chamadas recusadas também ficam na fila, então insistir só
// prolonga a espera.
export async function rateLimit(bucket: string, key: string, limit: number, windowMs: number): Promise<RateResult> {
  const db = await getDb();
  // Tudo que for anterior a este instante já saiu da janela e não conta mais.
  const desde = new Date(Date.now() - windowMs);

  // Limpeza: apaga as chamadas antigas desta origem/tipo (mantém a tabela pequena sem precisar de tarefa à parte).
  await db.delete(rateLimits).where(and(eq(rateLimits.bucket, bucket), eq(rateLimits.key, key), lt(rateLimits.at, desde)));
  // Registra esta chamada e pega o id dela: o id cresce sempre, então serve de "número na fila".
  const [minha] = await db.insert(rateLimits).values({ bucket, key }).returning({ id: rateLimits.id });

  // Filtro: chamadas desta origem/tipo que ainda estão dentro da janela.
  const dentro = and(eq(rateLimits.bucket, bucket), eq(rateLimits.key, key), gt(rateLimits.at, desde));
  // Posição desta chamada = quantas chamadas da janela têm id menor ou igual ao meu.
  const [{ posicao }] = await db
    .select({ posicao: count() })
    .from(rateLimits)
    .where(and(dentro, lte(rateLimits.id, minha.id)));
  if (posicao <= limit) return { allowed: true, retryAfterSeconds: 0 };

  // Libera quando a chamada mais antiga da janela sair dela.
  const [antiga] = await db.select({ at: rateLimits.at }).from(rateLimits).where(dentro).orderBy(rateLimits.at).limit(1);
  const espera = antiga ? antiga.at.getTime() + windowMs - Date.now() : windowMs;
  // No mínimo 1 segundo, arredondado para cima (é o valor do cabeçalho Retry-After).
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(espera / 1000)) };
}
