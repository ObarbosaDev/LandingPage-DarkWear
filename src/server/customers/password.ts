// ============================================================================
// Senha do cliente: regras, hash e verificação.
//
// Quem usa: src/server/customers/index.ts (cadastro, login, troca de senha).
// Por que existe: a senha é a barreira da conta. Ela NUNCA é guardada: o banco guarda só um "hash"
// (uma impressão digital de mão única) feito com scrypt, um algoritmo de propósito lento e que gasta
// bastante memória, para que adivinhar senhas por força bruta, mesmo com o banco vazado, seja caro.
// scrypt já vem no Node: não há dependência externa para manter.
//
// Formato guardado:  scrypt$N$r$p$sal$hash   (parâmetros dentro do próprio texto)
// Guardar os parâmetros junto permite endurecê-los no futuro sem quebrar as senhas já cadastradas.
// ============================================================================

import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Parâmetros atuais (os recomendados para uso interativo): N = custo de CPU/memória, r = bloco, p = paralelismo.
const N = 16384;
const R = 8;
const P = 1;
// Tamanhos: sal de 16 bytes (único por senha) e hash de 64 bytes.
const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Limites aceitos ao LER um hash do banco. O hash vem do nosso banco, mas um valor corrompido não pode
// pedir uma quantidade absurda de memória ou tempo.
const N_MIN = 2 ** 12;
const N_MAX = 2 ** 16;

/** scrypt como Promise, sem travar o servidor (roda fora da thread principal). */
function derive(senha: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem: a memória usada é ~128 * N * r bytes; damos o dobro de folga.
    scrypt(senha, salt, KEY_BYTES, { N: n, r, p, maxmem: 256 * n * r }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * A senha como é usada de verdade: texto Unicode normalizado (NFKC). Sem isso, "é" digitado como uma
 * letra e "é" digitado como "e" + acento seriam senhas diferentes para o computador e iguais para a pessoa.
 */
const normalizar = (senha: string) => senha.normalize("NFKC");

/**
 * Confere as regras da senha de um cadastro ou de uma troca.
 *
 * @param email o e-mail da conta (a senha não pode ser igual a ele)
 * @returns o texto do problema, para mostrar à pessoa, ou null se a senha serve
 */
export function validatePassword(senha: string, email: string): string | null {
  // Corpo adulterado (número, objeto, vazio): não é uma senha.
  if (typeof senha !== "string") return "Informe a senha.";
  if (senha.trim() === "") return "A senha não pode ser só espaços.";
  // Conta caracteres de verdade (um emoji vale 1, não 2).
  const tamanho = Array.from(senha).length;
  if (tamanho < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (tamanho > 128) return "A senha pode ter no máximo 128 caracteres.";
  if (senha.trim().toLowerCase() === String(email).trim().toLowerCase()) return "A senha precisa ser diferente do e-mail.";
  return null;
}

/** Gera o hash que vai para o banco. Cada chamada usa um sal novo: a mesma senha nunca dá o mesmo hash. */
export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(normalizar(senha), salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/**
 * Diz se a senha digitada corresponde ao hash guardado.
 * Nunca lança erro: hash vazio, corrompido ou de outro formato simplesmente não autentica.
 * A comparação final é em tempo constante (não revela, pelo tempo, quantos caracteres batem).
 */
export async function verifyPassword(senha: string, guardado: string): Promise<boolean> {
  if (typeof senha !== "string" || typeof guardado !== "string") return false;
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const [, nTxt, rTxt, pTxt, saltHex, hashHex] = partes;
  const n = Number(nTxt);
  const r = Number(rTxt);
  const p = Number(pTxt);
  // Parâmetros dentro de limites sensatos, e N potência de 2 (exigência do scrypt).
  if (!Number.isInteger(n) || n < N_MIN || n > N_MAX || (n & (n - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4) return false;
  if (!/^[0-9a-f]{16,128}$/.test(saltHex) || saltHex.length % 2 !== 0) return false;
  if (!/^[0-9a-f]{128}$/.test(hashHex)) return false;

  try {
    const esperado = Buffer.from(hashHex, "hex");
    const calculado = await derive(normalizar(senha), Buffer.from(saltHex, "hex"), n, r, p);
    return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

/**
 * Faz o mesmo trabalho de uma verificação, sem comparar com nada.
 * O login chama isto quando o e-mail NÃO existe: sem isso, e-mail inexistente responderia bem mais
 * rápido que senha errada, e esse tempo entregaria quem tem conta na loja.
 */
export async function fakeVerify(): Promise<void> {
  await derive("senha-falsa-para-igualar-o-tempo", Buffer.alloc(SALT_BYTES, 1), N, R, P);
}
