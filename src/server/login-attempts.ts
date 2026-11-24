// ============================================================================
// Contagem de ERROS DE LOGIN por chave (por e-mail, no caso das contas).
//
// Quem usa: a ação de entrar (src/app/actions-cliente.ts). Antes ficava dentro do módulo do painel, quando o
// painel tinha senha própria; agora o painel não tem login (o administrador entra pela mesma tela de todo
// mundo), e este controle serve a todas as contas.
//
// As falhas ficam no banco (tabela login_attempts), então o limite vale entre todas as instâncias do servidor.
// 5 erros dentro de 15 minutos bloqueiam a chave até o erro mais antigo sair da janela.
// ============================================================================

import "server-only";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Diz se esta chave já errou a senha vezes demais e deve ser barrada. */
export async function isLockedOut(key: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.failedAt, new Date(Date.now() - WINDOW_MS))));
  return row.n >= MAX_FAILS;
}

/** Anota uma senha errada desta chave. */
export async function registerFailure(key: string): Promise<void> {
  const db = await getDb();
  await db.insert(loginAttempts).values({ key });
  // Limpa o que já saiu da janela, para a tabela não crescer sem fim.
  await db.delete(loginAttempts).where(lt(loginAttempts.failedAt, new Date(Date.now() - WINDOW_MS)));
}

/** Esquece as falhas desta chave (chamada quando o login dá certo). */
export async function clearFailures(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
