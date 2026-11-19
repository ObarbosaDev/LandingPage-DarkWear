// ============================================================================
// Autenticação do painel do dono: uma senha única e uma sessão assinada em cookie.
//
// Quem usa: a tela de login (/admin/login → loginAction), o layout do painel e TODAS as páginas e
// ações de /admin (via requireAdmin), e o botão "Sair".
//
// Como funciona, em resumo:
//   1. O dono digita a senha em /admin/login.
//   2. Se bater com ADMIN_PASSWORD, o servidor cria um "token" (um bilhete com validade de 12 h,
//      assinado com ADMIN_SESSION_SECRET) e o guarda num cookie do navegador.
//   3. A cada página/ação do painel, o servidor confere se o cookie traz um token válido.
// Como só o servidor conhece o segredo, ninguém consegue fabricar um token falso.
//
// Sem dependências externas. Para vários usuários ou recuperação de senha, migrar para um provedor
// de autenticação (ex.: Clerk, pelo Marketplace da Vercel).
// ============================================================================

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";

// Nome do cookie da sessão no navegador do dono.
export const ADMIN_COOKIE = "dw_admin";
// Quanto tempo a sessão vale depois do login.
const SESSION_HOURS = 12;
// O cookie só é enviado em endereços /admin: o resto do site nem o vê.
const COOKIE_PATH = "/admin";

/** O segredo que assina as sessões, ou null se não estiver configurado ou for curto demais. */
function sessionSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  // Mínimo de 32 caracteres: um segredo curto seria fácil de adivinhar por tentativa e erro.
  return s && s.length >= 32 ? s : null;
}

// O painel só abre se a senha e o segredo estiverem configurados.
export function adminConfigured(): boolean {
  return Boolean(sessionSecret() && process.env.ADMIN_PASSWORD);
}

// Gera a "assinatura" de um texto: um código que só quem tem a chave consegue produzir.
// Se alguém mudar o texto, a assinatura deixa de bater.
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

/**
 * Cria o token da sessão: "<dados>.<assinatura>", onde os dados dizem quando a sessão expira.
 * Exportada para os testes; o login usa startSession(), que a chama.
 */
export function createSessionToken(): string {
  const key = sessionSecret();
  if (!key) throw new Error("ADMIN_SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

/**
 * Diz se um token é autêntico e ainda está dentro da validade.
 * Recusa token vazio, mal formado, com assinatura errada (adulterado, ou feito com outro segredo)
 * e expirado.
 */
export function verifySessionToken(token: string): boolean {
  const key = sessionSecret();
  if (!key) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  // Refaz a assinatura dos dados e compara com a recebida. timingSafeEqual compara em tempo
  // constante, para ninguém descobrir a assinatura certa medindo quanto a resposta demora.
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  // A assinatura bateu: agora só falta conferir a validade.
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

// Compara as senhas pelo resumo (mesmo tamanho) em tempo constante.
// Passar as duas por SHA-256 antes faz as duas comparações terem sempre o mesmo tamanho, o que
// evita revelar o comprimento da senha real e permite usar timingSafeEqual.
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Abre a sessão: grava o cookie com o token no navegador. Chamada pelo login depois da senha certa. */
export async function startSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(), {
    // httpOnly: o JavaScript da página não consegue ler o cookie (protege contra roubo por script).
    httpOnly: true,
    // strict: o navegador só envia o cookie em navegação dentro do próprio site (protege contra CSRF).
    sameSite: "strict",
    // secure: em produção, só trafega por HTTPS.
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: SESSION_HOURS * 3600,
  });
}

/** Encerra a sessão (botão "Sair"): apaga o cookie. */
export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: COOKIE_PATH });
}

/** Diz se quem está chamando tem uma sessão válida de dono. */
export async function isAdmin(): Promise<boolean> {
  await connection(); // a validade da sessão depende da hora atual: sempre no momento do pedido
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? verifySessionToken(token) : false;
}

// Chame no início de toda página e toda ação do painel: sem sessão válida, volta para o login.
// Cada página e cada ação repete esta conferência de propósito: uma ação do painel pode ser chamada
// direto, sem passar pela página, então esconder a tela não basta.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

// ---------- Limite de tentativas de login ----------
// As falhas ficam no banco, então o limite vale entre todas as instâncias do servidor.

// 5 erros dentro de 15 minutos bloqueiam a origem até a mais antiga sair da janela.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Diz se esta origem já errou a senha vezes demais e deve ser barrada. */
export async function isLockedOut(key: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.failedAt, new Date(Date.now() - WINDOW_MS))));
  return row.n >= MAX_FAILS;
}

/** Anota uma senha errada desta origem. */
export async function registerFailure(key: string): Promise<void> {
  const db = await getDb();
  await db.insert(loginAttempts).values({ key });
  // Limpa o que já saiu da janela, para a tabela não crescer sem fim.
  await db.delete(loginAttempts).where(lt(loginAttempts.failedAt, new Date(Date.now() - WINDOW_MS)));
}

/** Esquece as falhas desta origem (chamada quando o login dá certo). */
export async function clearFailures(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
