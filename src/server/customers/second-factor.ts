// ============================================================================
// SEGUNDO FATOR das contas de administrador: ligar, desligar e conferir o código do aplicativo autenticador.
//
// Quem usa:
//   - o comando de terminal do dono (scripts/admin.ts: "npm run admin:2fa" e "admin:2fa-remover"). Só o terminal liga
//     ou desliga: nenhuma tela do site faz isso, pelo mesmo motivo de o papel de administrador só nascer no terminal;
//   - o login (src/app/actions-cliente.ts), que depois de conferir a senha pede o código das contas que o têm.
//
// A parte pura (o cálculo do código, a cifragem e o bilhete) fica em ./totp.ts.
// ============================================================================

import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { parseEmail } from "@/server/customers";
import {
  COOKIE_2FA,
  MINUTOS_DO_BILHETE,
  cifrarSegredo,
  decifrarSegredo,
  gerarSegredo,
  signDesafio2fa,
  uriDoAutenticador,
  verifyDesafio2fa,
  verificarTotp,
} from "@/server/customers/totp";

/** O segredo do site (o mesmo das sessões), ou erro claro se não estiver configurado. */
function segredoDoSite(): string {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  if (typeof s !== "string" || s.length < 32) throw new Error("CUSTOMER_SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  return s;
}

/** A conta ativa de um administrador pelo e-mail, ou undefined. */
async function adminPorEmail(emailBruto: string) {
  const email = parseEmail(String(emailBruto ?? ""));
  if (!email) return undefined;
  const db = await getDb();
  const [c] = await db.select().from(customers).where(and(eq(customers.email, email), isNull(customers.anonymizedAt)));
  return c && c.role === "admin" ? c : undefined;
}

/**
 * Liga (ou refaz) o segundo fator de um administrador: gera um segredo novo, guarda-o cifrado e o devolve UMA vez,
 * para o dono cadastrá-lo no aplicativo. Refazer troca o segredo (o aparelho antigo deixa de valer) e derruba as
 * sessões abertas. Só vale para quem já é administrador.
 * @throws Error se a conta não existe ou não é de administrador
 */
export async function ligarSegundoFator(emailBruto: string): Promise<{ email: string; segredo: string; uri: string }> {
  const conta = await adminPorEmail(emailBruto);
  if (!conta) throw new Error("Administrador não encontrado. O segundo fator só existe para contas de administrador (admin:criar).");
  const segredo = gerarSegredo();
  const db = await getDb();
  await db
    .update(customers)
    .set({ totpSecret: cifrarSegredo(segredo, segredoDoSite()), totpLastStep: 0, sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(eq(customers.id, conta.id));
  return { email: conta.email, segredo, uri: uriDoAutenticador(conta.email, segredo, "DarkWear") };
}

/** Desliga o segundo fator de um administrador (volta a entrar só com a senha) e derruba as sessões abertas. */
export async function desligarSegundoFator(emailBruto: string): Promise<"desligado" | "nao-tinha" | "nao-encontrado"> {
  const conta = await adminPorEmail(emailBruto);
  if (!conta) return "nao-encontrado";
  if (conta.totpSecret === null) return "nao-tinha";
  const db = await getDb();
  await db
    .update(customers)
    .set({ totpSecret: null, totpLastStep: 0, sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(eq(customers.id, conta.id));
  return "desligado";
}

/**
 * Confere o código digitado de uma conta com segundo fator. Verdadeiro só se o código está certo E ainda não foi
 * usado: o passo aceito é gravado com um UPDATE condicional ("só se o último passo for menor"), então dois logins
 * simultâneos com o mesmo código não passam os dois.
 */
export async function conferirSegundoFator(id: number, digitado: string): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id < 1) return false;
  const db = await getDb();
  const [c] = await db.select({ secret: customers.totpSecret, passo: customers.totpLastStep }).from(customers).where(and(eq(customers.id, id), isNull(customers.anonymizedAt)));
  if (!c || c.secret === null) return false;
  const segredo = decifrarSegredo(c.secret, segredoDoSite());
  if (!segredo) return false;
  const r = verificarTotp(segredo, digitado, Date.now(), c.passo);
  if (!r.ok) return false;
  const gravado = await db
    .update(customers)
    .set({ totpLastStep: r.passo })
    .where(and(eq(customers.id, id), lt(customers.totpLastStep, r.passo)))
    .returning({ id: customers.id });
  return gravado.length > 0;
}

// ---------- o bilhete (cookie) entre a senha e o código ----------

/** Guarda o bilhete no navegador: a senha deste login já foi conferida, falta o código. Vale 5 minutos. */
export async function guardarDesafio(id: number, version: number): Promise<void> {
  (await cookies()).set(COOKIE_2FA, signDesafio2fa({ id, version }, segredoDoSite()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MINUTOS_DO_BILHETE * 60,
  });
}

/** O bilhete atual (conta e versão da sessão), ou null se não há ou está vencido/adulterado. */
export async function lerDesafio(): Promise<{ id: number; version: number } | null> {
  const token = (await cookies()).get(COOKIE_2FA)?.value;
  if (!token) return null;
  return verifyDesafio2fa(token, segredoDoSite());
}

/** Apaga o bilhete (depois de entrar, ou quando ele não vale mais). */
export async function limparDesafio(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_2FA, path: "/" });
}
