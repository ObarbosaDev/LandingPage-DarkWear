// ============================================================================
// Testes da SENHA do cliente (src/server/customers/password.ts): regras, hash e verificação.
// Por que testar: é a barreira da conta. Uma regra frouxa deixa senha fraca entrar; uma verificação
// com erro deixa a pessoa errada entrar (ou a certa de fora); um hash fraco vaza senhas se o banco vazar.
// ============================================================================

import { describe, expect, it } from "vitest";
import { fakeVerify, hashPassword, validatePassword, verifyPassword } from "@/server/customers/password";

const EMAIL = "ana@exemplo.com";

describe("validatePassword", () => {
  it("aceita de 10 a 128 caracteres, com emoji e espaços no meio", () => {
    expect(validatePassword("a".repeat(10), EMAIL)).toBeNull();
    expect(validatePassword("a".repeat(128), EMAIL)).toBeNull();
    expect(validatePassword("uma frase longa 🔒🔒", EMAIL)).toBeNull();
    // Emoji conta como UM caractere (não como dois pedaços internos).
    expect(validatePassword("🔒".repeat(10), EMAIL)).toBeNull();
  });

  it("recusa 9 e 129 caracteres", () => {
    expect(validatePassword("a".repeat(9), EMAIL)).toMatch(/pelo menos 10/);
    expect(validatePassword("a".repeat(129), EMAIL)).toMatch(/no máximo 128/);
    expect(validatePassword("🔒".repeat(9), EMAIL)).toMatch(/pelo menos 10/);
  });

  it("recusa senha só de espaços, mesmo com 10 ou mais", () => {
    expect(validatePassword(" ".repeat(12), EMAIL)).toMatch(/espaços/);
    expect(validatePassword("\t\n  ".repeat(4), EMAIL)).toMatch(/espaços/);
  });

  it("recusa senha igual ao e-mail, sem diferenciar maiúsculas nem espaços nas pontas", () => {
    expect(validatePassword("ana@exemplo.com", "ana@exemplo.com")).toMatch(/e-mail/);
    expect(validatePassword("ANA@Exemplo.com", "ana@exemplo.com")).toMatch(/e-mail/);
    expect(validatePassword("  ana@exemplo.com ", "ana@exemplo.com")).toMatch(/e-mail/);
  });

  it("recusa tipos que não são texto (corpo adulterado)", () => {
    for (const v of [undefined, null, 1234567890, {}, []]) {
      expect(validatePassword(v as unknown as string, EMAIL)).toMatch(/senha/i);
    }
  });
});

describe("hashPassword e verifyPassword", () => {
  it("a senha certa passa e a errada não", async () => {
    const h = await hashPassword("minha senha forte 123");
    expect(await verifyPassword("minha senha forte 123", h)).toBe(true);
    expect(await verifyPassword("minha senha forte 124", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });

  it("a mesma senha gera hashes diferentes (sal próprio) e o hash não contém a senha", async () => {
    const a = await hashPassword("minha senha forte 123");
    const b = await hashPassword("minha senha forte 123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("minha senha");
    expect(a).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  // Acento digitado de dois jeitos (composto e decomposto) é a mesma senha para a pessoa.
  it("normaliza o Unicode: 'é' composto e decomposto valem igual", async () => {
    const h = await hashPassword("senéha-de-teste");
    expect(await verifyPassword("senéha-de-teste", h)).toBe(true);
  });

  it("maiúsculas e espaços no fim importam (não são ignorados)", async () => {
    const h = await hashPassword("Senha Forte 123");
    expect(await verifyPassword("senha forte 123", h)).toBe(false);
    expect(await verifyPassword("Senha Forte 123 ", h)).toBe(false);
  });

  // Hash vindo do banco corrompido, vazio ou de outro formato: recusa sem lançar erro.
  it.each(["", "abc", "scrypt$", "scrypt$1$2$3$aa$bb", "bcrypt$x$y", "scrypt$16384$8$1$zz$zz", "scrypt$99999999999$8$1$00$00"])(
    "hash inválido %j nunca autentica nem lança erro",
    async (stored) => {
      expect(await verifyPassword("qualquer senha 123", stored)).toBe(false);
    },
  );

  it("tipos que não são texto nunca autenticam", async () => {
    const h = await hashPassword("minha senha forte 123");
    expect(await verifyPassword(undefined as unknown as string, h)).toBe(false);
    expect(await verifyPassword("x".repeat(10), null as unknown as string)).toBe(false);
  });
});

describe("fakeVerify", () => {
  // Para e-mail inexistente o login gasta o mesmo trabalho de uma conta real: o tempo não revela quem existe.
  it("gasta tempo comparável ao de uma verificação real", async () => {
    const h = await hashPassword("minha senha forte 123");
    const medir = async (f: () => Promise<unknown>) => {
      const t = performance.now();
      await f();
      return performance.now() - t;
    };
    const real = await medir(() => verifyPassword("outra senha qualquer", h));
    const falsa = await medir(() => fakeVerify());
    expect(falsa).toBeGreaterThan(real * 0.4);
  });
});
