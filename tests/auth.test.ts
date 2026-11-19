import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminConfigured,
  checkPassword,
  clearFailures,
  createSessionToken,
  isLockedOut,
  registerFailure,
  verifySessionToken,
} from "@/server/admin/auth";
import { getDb } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());

describe("senha do painel", () => {
  it("aceita só a senha certa", () => {
    expect(checkPassword("senha-de-teste")).toBe(true);
    for (const errada of ["", "senha-de-teste ", "SENHA-DE-TESTE", "outra", "x".repeat(500)]) {
      expect(checkPassword(errada), errada.slice(0, 10)).toBe(false);
    }
  });

  it("sem senha configurada, nada entra", () => {
    const antes = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    expect(checkPassword("")).toBe(false);
    expect(adminConfigured()).toBe(false);
    process.env.ADMIN_PASSWORD = antes;
  });

  it("segredo curto deixa o painel desconfigurado", () => {
    const antes = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = "curto";
    expect(adminConfigured()).toBe(false);
    expect(() => createSessionToken()).toThrow();
    process.env.ADMIN_SESSION_SECRET = antes;
  });
});

describe("sessão assinada", () => {
  it("aceita um token válido", () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  it("recusa token adulterado, vazio ou de outro segredo", () => {
    const t = createSessionToken();
    const [payload, sig] = t.split(".");
    const forjado = Buffer.from(JSON.stringify({ exp: Date.now() + 1e12 })).toString("base64url");
    for (const ruim of ["", "abc", `${payload}.`, `.${sig}`, `${forjado}.${sig}`, `${payload}.${sig}x`, `${payload}.${sig.slice(0, -2)}`]) {
      expect(verifySessionToken(ruim), ruim.slice(0, 12)).toBe(false);
    }
    const antes = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = "outro-segredo-tambem-com-mais-de-32-caracteres";
    expect(verifySessionToken(t)).toBe(false);
    process.env.ADMIN_SESSION_SECRET = antes;
  });

  it("expira depois de 12 horas", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = createSessionToken();
    vi.setSystemTime(Date.now() + 11 * 3600 * 1000);
    expect(verifySessionToken(t)).toBe(true);
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
    expect(verifySessionToken(t)).toBe(false);
  });
});

describe("limite de tentativas de login", () => {
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

  it("falhas com mais de 15 minutos não contam", async () => {
    const db = await getDb();
    const velha = new Date(Date.now() - 16 * 60 * 1000);
    await db.insert(loginAttempts).values(Array.from({ length: 5 }, () => ({ key: "4.4.4.4", failedAt: velha })));
    expect(await isLockedOut("4.4.4.4")).toBe(false);
  });
});
