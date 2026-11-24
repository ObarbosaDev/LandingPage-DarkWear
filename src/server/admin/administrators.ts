// ============================================================================
// ADMINISTRADORES: criar, remover, redefinir a senha e listar quem administra a loja.
//
// Quem usa: o comando de terminal do dono (scripts/admin.ts: "npm run admin:criar", "admin:remover",
// "admin:senha", "admin:listar") e a tela /admin/clientes (listar).
//
// ESTE É O ÚNICO CAMINHO QUE CONCEDE O PAPEL DE ADMINISTRADOR. Nenhum formulário, tela ou API do site escreve
// customers.role: quem consegue rodar este código é quem tem acesso ao servidor ou ao banco (o dono). É de
// propósito: se o site pudesse promover alguém, uma falha em qualquer tela viraria acesso total à loja.
//
// Como o dono entrega o acesso: roda "npm run admin:criar", recebe e-mail + uma SENHA PROVISÓRIA (mostrada uma
// vez) e passa os dois à pessoa. No primeiro login a pessoa é obrigada a trocar a senha (ver
// requireAdmin e requireCustomer), então a provisória não fica valendo.
// ============================================================================

import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { novaSenhaProvisoria, parseEmail, parsePhone } from "@/server/customers";
import { hashPassword } from "@/server/customers/password";

/** O resultado de criar (ou promover) um administrador. A senha provisória só existe aqui, nesta resposta. */
export type AdminCriado = { id: number; email: string; senhaProvisoria: string; criado: boolean };

/** Uma conta ativa pelo e-mail (anonimizada não conta: o e-mail dela já foi liberado). */
async function contaAtiva(email: string) {
  const db = await getDb();
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.email, email), isNull(customers.anonymizedAt)));
  return c;
}

/**
 * Cria um administrador, ou promove a conta que já existe com esse e-mail.
 *   - conta nova: exige nome e celular (a pessoa não passou pelo cadastro do site);
 *   - conta existente: mantém nome e celular, vira administrador e TROCA a senha pela provisória (a antiga
 *     deixa de valer, e todas as sessões abertas caem).
 * Nos dois casos o primeiro login obriga a trocar a senha.
 * Repetir o comando para quem já é administrador só gera outra senha provisória.
 *
 * @throws Error com a mensagem a mostrar ao dono, se e-mail, nome ou celular forem inválidos
 */
export async function createAdministrator(input: { email: string; nome?: string; celular?: string }): Promise<AdminCriado> {
  const email = parseEmail(String(input.email ?? ""));
  if (!email) throw new Error("E-mail inválido.");

  const senhaProvisoria = novaSenhaProvisoria();
  const passwordHash = await hashPassword(senhaProvisoria);
  const db = await getDb();

  const existente = await contaAtiva(email);
  if (existente) {
    await db
      .update(customers)
      .set({ role: "admin", passwordHash, mustChangePassword: true, sessionVersion: sql`${customers.sessionVersion} + 1` })
      .where(eq(customers.id, existente.id));
    return { id: existente.id, email, senhaProvisoria, criado: false };
  }

  // Conta nova: o dono precisa dizer quem é a pessoa.
  const nome = String(input.nome ?? "").trim().replace(/\s+/g, " ");
  const tamanho = Array.from(nome).length;
  if (tamanho < 2 || tamanho > 80 || /[\u0000-\u001f\u007f]/.test(nome)) throw new Error("Informe o nome do administrador (de 2 a 80 caracteres).");
  const phone = parsePhone(String(input.celular ?? ""));
  if (!phone) throw new Error("Informe um celular válido, com DDD (ex.: 11987654321).");

  const [novo] = await db
    .insert(customers)
    // privacyAcceptedAt: conta de equipe criada pelo dono, que não passa pelo cadastro do site. O campo é
    // obrigatório no banco; aqui registra o momento da criação.
    .values({ name: nome, email, phone, passwordHash, role: "admin", mustChangePassword: true, privacyAcceptedAt: new Date() })
    .returning({ id: customers.id });
  return { id: novo.id, email, senhaProvisoria, criado: true };
}

/**
 * Tira o papel de administrador (a conta continua existindo, como cliente comum) e derruba as sessões abertas.
 * @returns "removido", "nao-era-admin" (já era cliente comum) ou "nao-encontrado"
 */
export async function removeAdministrator(emailBruto: string): Promise<"removido" | "nao-era-admin" | "nao-encontrado"> {
  const email = parseEmail(String(emailBruto ?? ""));
  const conta = email ? await contaAtiva(email) : undefined;
  if (!conta) return "nao-encontrado";
  if (conta.role !== "admin") return "nao-era-admin";
  const db = await getDb();
  await db
    .update(customers)
    .set({ role: "cliente", sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(eq(customers.id, conta.id));
  return "removido";
}

/**
 * Gera uma senha provisória nova para um administrador (esqueceu a senha). NUNCA promove ninguém: só vale para
 * quem já é administrador. A senha antiga deixa de valer e as sessões abertas caem.
 * @throws Error se a conta não existe ou não é de administrador
 */
export async function resetAdministratorPassword(emailBruto: string): Promise<{ senhaProvisoria: string }> {
  const email = parseEmail(String(emailBruto ?? ""));
  const conta = email ? await contaAtiva(email) : undefined;
  if (!conta) throw new Error("Conta não encontrada.");
  if (conta.role !== "admin") throw new Error("Esta conta não é de administrador. Para criar um, use admin:criar.");

  const senhaProvisoria = novaSenhaProvisoria();
  const passwordHash = await hashPassword(senhaProvisoria);
  const db = await getDb();
  await db
    .update(customers)
    .set({ passwordHash, mustChangePassword: true, sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(eq(customers.id, conta.id));
  return { senhaProvisoria };
}

/** Os administradores ativos, por ordem de criação. Nunca devolve o hash da senha. */
export async function listAdministrators(): Promise<{ id: number; name: string; email: string; mustChangePassword: boolean; createdAt: Date }[]> {
  const db = await getDb();
  return db
    .select({ id: customers.id, name: customers.name, email: customers.email, mustChangePassword: customers.mustChangePassword, createdAt: customers.createdAt })
    .from(customers)
    .where(and(eq(customers.role, "admin"), isNull(customers.anonymizedAt)))
    .orderBy(asc(customers.id));
}
