// Autenticação do painel do dono: uma senha única e uma sessão assinada em cookie.
// Sem dependências externas. Para vários usuários ou recuperação de senha, migrar para um provedor
// de autenticação (ex.: Clerk, pelo Marketplace da Vercel).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const ADMIN_COOKIE = "dw_admin";
const SESSION_HOURS = 12;
const COOKIE_PATH = "/admin";

function sessionSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

// O painel só abre se a senha e o segredo estiverem configurados.
export function adminConfigured(): boolean {
  return Boolean(sessionSecret() && process.env.ADMIN_PASSWORD);
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

function createSessionToken(): string {
  const key = sessionSecret();
  if (!key) throw new Error("ADMIN_SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

function verifySessionToken(token: string): boolean {
  const key = sessionSecret();
  if (!key) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

// Compara as senhas pelo resumo (mesmo tamanho) em tempo constante.
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function startSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: COOKIE_PATH });
}

export async function isAdmin(): Promise<boolean> {
  await connection(); // a validade da sessão depende da hora atual: sempre no momento do pedido
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? verifySessionToken(token) : false;
}

// Chame no início de toda página e toda ação do painel: sem sessão válida, volta para o login.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

// ---------- Limite de tentativas de login ----------
// Em memória: vale por instância do servidor. Reduz força bruta, mas em ambiente com várias
// instâncias o limite é por instância. Para rigor total, guardar as tentativas no banco.

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { fails: number; firstAt: number }>();

export async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export function isLockedOut(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return a.fails >= MAX_FAILS;
}

export function registerFailure(key: string): void {
  const a = attempts.get(key);
  if (!a || Date.now() - a.firstAt > WINDOW_MS) attempts.set(key, { fails: 1, firstAt: Date.now() });
  else a.fails += 1;
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
