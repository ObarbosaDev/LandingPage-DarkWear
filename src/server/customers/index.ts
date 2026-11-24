// ============================================================================
// Contas de cliente: cadastro, login, troca de senha, saída de todos os aparelhos, exclusão de
// conta e senha provisória do painel.
//
// Quem usa: as ações das telas /conta/* (src/app/actions-cliente.ts), a sessão do cliente
// (./session.ts) e o painel do dono (/admin/clientes).
// A senha em si (regras, hash e verificação) fica em ./password.ts.
//
// Princípios:
//   1. Tudo que vem do formulário é não confiável: cada campo é conferido aqui, no servidor.
//   2. O hash da senha NUNCA sai deste módulo (CustomerView não o contém).
//   3. E-mail é sempre guardado em minúsculas e sem espaços nas pontas: "Ana@X.com" e "ana@x.com"
//      são a mesma conta (o banco também confere, ver migração 0007).
//   4. Conta excluída é ANONIMIZADA, nunca apagada: os pedidos ficam, os dados pessoais somem.
// ============================================================================

import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { fakeVerify, hashPassword, validatePassword, verifyPassword } from "@/server/customers/password";

/** Os dados de um cliente que o resto do sistema pode ver. Repare: não há hash de senha aqui. */
export type CustomerView = {
  id: number;
  name: string;
  email: string;
  /** Só dígitos: DDD + número (10 ou 11). */
  phone: string;
  /** Número que invalida cookies antigos quando aumenta (ver ./session.ts). */
  sessionVersion: number;
  /** Verdadeiro depois de uma senha provisória: a pessoa só deve conseguir trocar a senha. */
  mustChangePassword: boolean;
  createdAt: Date;
};

/** Os dados de um cadastro já conferidos e limpos, prontos para gravar. */
export type RegisterInput = { name: string; email: string; phone: string; password: string };

// Troca qualquer caractere de controle (que não deveria estar em nome nem e-mail).
const TEM_CONTROLE = /[\u0000-\u001f\u007f]/;

// ---------------------------------------------------------------------------
// Conferência do formulário de cadastro
// ---------------------------------------------------------------------------

/**
 * Lê o celular digitado e devolve só os dígitos (DDD + número), ou null se não for um celular/telefone
 * brasileiro plausível. Aceita máscara, parênteses, hífen e o "+55" na frente.
 */
function parsePhone(raw: string): string | null {
  let d = raw.replace(/[\s().+-]/g, "");
  if (!/^\d+$/.test(d)) return null;
  // Com o código do país (55) na frente, tira.
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  // O DDD vai de 11 a 99 (nenhum dígito 0).
  if (!/^[1-9][1-9]/.test(d)) return null;
  // Celular tem 11 dígitos e começa com 9 depois do DDD.
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

/**
 * Confere o formulário de cadastro e devolve os dados limpos, ou a mensagem do primeiro problema.
 * Campos ausentes ou que não são texto (arquivo no lugar de nome, por exemplo) contam como vazios.
 */
export function parseRegisterForm(form: FormData): { ok: true; data: RegisterInput } | { ok: false; error: string } {
  const texto = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");

  // Nome: espaços repetidos viram um só; de 2 a 80 caracteres.
  const name = texto("name").trim().replace(/\s+/g, " ");
  const tamanhoNome = Array.from(name).length;
  if (tamanhoNome < 2 || tamanhoNome > 80 || TEM_CONTROLE.test(name)) return { ok: false, error: "Informe o nome, de 2 a 80 caracteres." };

  // E-mail: minúsculas, sem espaços nas pontas, formato básico (algo@algo.algo) e até 254 caracteres.
  const email = texto("email").trim().toLowerCase();
  if (email.length > 254 || TEM_CONTROLE.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "Informe um e-mail válido." };
  }

  const phone = parsePhone(texto("phone"));
  if (!phone) return { ok: false, error: "Informe um celular com DDD, por exemplo (11) 98765-4321." };

  // A senha NÃO é aparada nem alterada: espaços e maiúsculas fazem parte dela.
  const password = texto("password");
  const problema = validatePassword(password, email);
  if (problema) return { ok: false, error: problema };

  // Uma caixa de seleção marcada chega como "on".
  if (texto("privacy") !== "on") return { ok: false, error: "Aceite a política de privacidade para criar a conta." };

  return { ok: true, data: { name, email, phone, password } };
}

// ---------------------------------------------------------------------------
// Cadastro e login
// ---------------------------------------------------------------------------

/** Diz se o erro do banco é "valor repetido" (código 23505 do Postgres), procurando também nas causas internas. */
function isUniqueViolation(e: unknown): boolean {
  let atual: unknown = e;
  for (let i = 0; i < 5 && atual && typeof atual === "object"; i++) {
    if ((atual as { code?: unknown }).code === "23505") return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Cria a conta. O e-mail repetido, inclusive quando dois cadastros chegam ao mesmo tempo, volta como
 * erro amigável (quem decide é a restrição UNIQUE do banco, não uma consulta prévia, que perderia a corrida).
 */
export async function registerCustomer(input: RegisterInput): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const passwordHash = await hashPassword(input.password);
  const db = await getDb();
  try {
    const [row] = await db
      .insert(customers)
      .values({ name: input.name, email: input.email, phone: input.phone, passwordHash, privacyAcceptedAt: new Date() })
      .returning({ id: customers.id });
    return { ok: true, id: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Já existe uma conta com este e-mail. Entre na sua conta ou use outro e-mail." };
    throw e;
  }
}

/**
 * Confere e-mail e senha. Devolve os dados mínimos da sessão, ou null: o chamador NÃO deve dizer qual
 * dos dois estava errado. Conta anonimizada nunca entra. Para e-mail inexistente, gasta o mesmo tempo
 * de uma verificação real (fakeVerify), para o tempo de resposta não revelar quem tem conta.
 */
export async function authenticate(
  email: string,
  password: string,
): Promise<{ id: number; sessionVersion: number; mustChangePassword: boolean } | null> {
  if (typeof email !== "string" || typeof password !== "string") {
    await fakeVerify();
    return null;
  }
  const db = await getDb();
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.email, email.trim().toLowerCase()), isNull(customers.anonymizedAt)));
  if (!c) {
    await fakeVerify();
    return null;
  }
  if (!(await verifyPassword(password, c.passwordHash))) return null;
  return { id: c.id, sessionVersion: c.sessionVersion, mustChangePassword: c.mustChangePassword };
}

/** Um cliente pelo id, sem o hash da senha. null se não existe ou se a conta foi anonimizada. */
export async function getCustomer(id: number): Promise<CustomerView | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const db = await getDb();
  const [c] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      sessionVersion: customers.sessionVersion,
      mustChangePassword: customers.mustChangePassword,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.anonymizedAt)));
  return c ?? null;
}

// ---------------------------------------------------------------------------
// Senha e sessões
// ---------------------------------------------------------------------------

/**
 * Troca a senha (tela /conta). Exige a senha atual. Aumenta a versão da sessão: os cookies de TODOS
 * os aparelhos deixam de valer (quem chama deve abrir a sessão de novo no aparelho atual).
 * Conta inexistente ou anonimizada responde como senha atual errada, sem revelar nada.
 */
export async function changePassword(id: number, atual: string, nova: string): Promise<"ok" | "senha-atual" | "invalida"> {
  if (typeof atual !== "string" || typeof nova !== "string") return "senha-atual";
  const db = await getDb();
  const [c] = await db.select().from(customers).where(and(eq(customers.id, Number(id)), isNull(customers.anonymizedAt)));
  if (!c || !(await verifyPassword(atual, c.passwordHash))) return "senha-atual";
  if (validatePassword(nova, c.email)) return "invalida";

  const passwordHash = await hashPassword(nova);
  // Só grava se a versão da sessão ainda é a que lemos: se outra troca aconteceu no meio, esta não sobrescreve.
  const feito = await db
    .update(customers)
    .set({ passwordHash, mustChangePassword: false, sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(and(eq(customers.id, c.id), eq(customers.sessionVersion, c.sessionVersion)))
    .returning({ id: customers.id });
  return feito.length > 0 ? "ok" : "senha-atual";
}

/** Botão "sair de todos os aparelhos": aumenta a versão da sessão e devolve o número novo (0 se a conta não existe). */
export async function signOutEverywhere(id: number): Promise<number> {
  const db = await getDb();
  const [r] = await db
    .update(customers)
    .set({ sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(and(eq(customers.id, Number(id)), isNull(customers.anonymizedAt)))
    .returning({ v: customers.sessionVersion });
  return r?.v ?? 0;
}

// ---------------------------------------------------------------------------
// Exclusão de conta e senha provisória
// ---------------------------------------------------------------------------

/**
 * "Excluir minha conta" (LGPD): apaga os dados pessoais e tira o acesso, mas MANTÉM a linha e os
 * pedidos ligados a ela (a loja precisa guardá-los). O e-mail original fica livre para novo cadastro.
 */
export async function anonymizeCustomer(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(customers)
    .set({
      name: "Cliente removido",
      email: `removido-${id}@invalid`,
      phone: "",
      // Um texto que não é um hash scrypt válido: nenhuma senha jamais confere com ele.
      passwordHash: "removido",
      mustChangePassword: false,
      anonymizedAt: new Date(),
      sessionVersion: sql`${customers.sessionVersion} + 1`,
    })
    .where(and(eq(customers.id, Number(id)), isNull(customers.anonymizedAt)));
}

// Letras e números sem os que se confundem ao ler (0/O, 1/l/I), para a senha provisória poder ser ditada.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Gera uma senha PROVISÓRIA (a recuperação por e-mail ainda não existe): o dono a repassa ao cliente,
 * que é obrigado a trocá-la no primeiro acesso. Os cookies antigos deixam de valer. Devolve a senha em
 * texto, que é mostrada UMA vez e nunca guardada em claro.
 */
export async function setTemporaryPassword(id: number): Promise<string> {
  const temporaria = Array.from({ length: 16 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  const passwordHash = await hashPassword(temporaria);
  const db = await getDb();
  const feito = await db
    .update(customers)
    .set({ passwordHash, mustChangePassword: true, sessionVersion: sql`${customers.sessionVersion} + 1` })
    .where(and(eq(customers.id, Number(id)), isNull(customers.anonymizedAt)))
    .returning({ id: customers.id });
  if (feito.length === 0) throw new Error("Conta não encontrada ou já removida.");
  return temporaria;
}
