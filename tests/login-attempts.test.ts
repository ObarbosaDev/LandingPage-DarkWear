// ============================================================================
// Testes do BLOQUEIO POR ERROS DE LOGIN (src/server/login-attempts.ts): 5 erros em 15 minutos travam a chave.
// Por que testar: é o que impede alguém de tentar milhares de senhas contra uma conta. (Os testes da senha
// única e do cookie do painel saíram junto com elas: o painel agora é aberto por contas com papel "admin",
// testadas em admin-access.test.ts.)
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { clearFailures, isLockedOut, registerFailure } from "@/server/login-attempts";
import { getDb } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);

describe("limite de tentativas de login", () => {
  // 5 erros bloqueiam a origem; outra origem (outro IP) não é afetada.
  it("trava na quinta falha e não afeta outras origens", async () => {
    for (let i = 0; i < 4; i++) await registerFailure("1.1.1.1");
    expect(await isLockedOut("1.1.1.1")).toBe(false);
    await registerFailure("1.1.1.1");
    expect(await isLockedOut("1.1.1.1")).toBe(true);
    expect(await isLockedOut("2.2.2.2")).toBe(false);
  });

  it("login certo zera as falhas", async () => {
    for (let i = 0; i < 5; i++) await registerFailure("3.3.3.3");
    await clearFailures("3.3.3.3");
    expect(await isLockedOut("3.3.3.3")).toBe(false);
  });

  // Insere 5 falhas "de 16 minutos atrás" direto no banco: já saíram da janela de 15 minutos.
  it("falhas com mais de 15 minutos não contam", async () => {
    const db = await getDb();
    const velha = new Date(Date.now() - 16 * 60 * 1000);
    await db.insert(loginAttempts).values(Array.from({ length: 5 }, () => ({ key: "4.4.4.4", failedAt: velha })));
    expect(await isLockedOut("4.4.4.4")).toBe(false);
  });
});
