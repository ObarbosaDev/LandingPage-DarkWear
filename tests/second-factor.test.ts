// ============================================================================
// Testes do LOGIN COM SEGUNDO FATOR: a senha certa de um administrador com autenticador NÃO abre a sessão; falta
// o código. O que mais importa provar:
//   - sem o código não há sessão (nem cookie de sessão), por mais que a senha esteja certa;
//   - cada código vale uma vez, e erros seguidos bloqueiam a conta;
//   - o bilhete do passo do código só serve para a conta que digitou a senha, por poucos minutos;
//   - o segredo fica cifrado no banco e só o terminal liga/desliga;
//   - quem não tem segundo fator entra como antes.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, loginAttempts, rateLimits } from "@/server/db/schema";
import { codigoAction, loginAction } from "@/app/actions-cliente";
import { removeAdministrator } from "@/server/admin/administrators";
import { hashPassword } from "@/server/customers/password";
import { conferirSegundoFator, desligarSegundoFator, ligarSegundoFator } from "@/server/customers/second-factor";
import { COOKIE_2FA, codigoTotp, signDesafio2fa } from "@/server/customers/totp";
import { changePassword } from "@/server/customers";
import { clienteDeTeste, resetDb } from "./helpers/db";

// ---------- o "navegador" de mentira ----------
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "10.0.0.1" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (o: { name: string }) => void jar.delete(o.name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (d: string) => {
    throw new Error(`REDIRECT:${d}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const SENHA = "minha senha forte 123";
const SEGREDO_SITE = process.env.CUSTOMER_SESSION_SECRET!;
const passoAtual = () => Math.floor(Date.now() / 30_000);

beforeEach(async () => {
  await resetDb();
  const db = await getDb();
  await db.delete(rateLimits);
  await db.delete(loginAttempts);
  jar.clear();
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const redireciona = async <T,>(f: () => Promise<T>): Promise<string | T> => {
  try {
    return await f();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

/** Cria um administrador com segundo fator ligado e devolve o segredo do aplicativo. */
async function adminComSegundoFator(email = "admin@exemplo.com") {
  const id = await clienteDeTeste(email);
  await (await getDb()).update(customers).set({ role: "admin", passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, id));
  const { segredo } = await ligarSegundoFator(email);
  return { id, email, segredo };
}
const entrarComSenha = (email: string, senha = SENHA) => redireciona(() => loginAction({}, form({ email, password: senha })));
const digitar = (code: string, extra: Record<string, string> = {}) => redireciona(() => codigoAction({}, form({ code, ...extra })));

describe("passo da senha", () => {
  it("senha certa de conta com segundo fator pede o código e NÃO abre a sessão", async () => {
    const a = await adminComSegundoFator();
    const r = await entrarComSenha(a.email);
    expect(r).toMatchObject({ etapa: "codigo", values: { email: a.email } });
    expect(jar.has("dw_cliente")).toBe(false);
    expect(jar.has(COOKIE_2FA)).toBe(true);
  });

  it("senha errada não revela que a conta tem segundo fator", async () => {
    const a = await adminComSegundoFator();
    const r = (await entrarComSenha(a.email, "senha errada qualquer 1")) as { error?: string; etapa?: string };
    expect(r.error).toBe("E-mail ou senha incorretos.");
    expect(r.etapa).toBeUndefined();
    expect(jar.has(COOKIE_2FA)).toBe(false);
  });

  it("conta sem segundo fator entra como sempre (administrador vai ao painel, cliente à conta)", async () => {
    const id = await clienteDeTeste("sem2fa@exemplo.com");
    await (await getDb()).update(customers).set({ role: "admin", passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, id));
    expect(await entrarComSenha("sem2fa@exemplo.com")).toBe("REDIRECT:/admin");
    expect(jar.has("dw_cliente")).toBe(true);
    jar.clear();
    const c = await clienteDeTeste("cliente@exemplo.com");
    await (await getDb()).update(customers).set({ passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, c));
    expect(await entrarComSenha("cliente@exemplo.com")).toBe("REDIRECT:/conta");
  });
});

describe("passo do código", () => {
  it("código certo abre a sessão, leva ao painel e apaga o bilhete", async () => {
    const a = await adminComSegundoFator();
    await entrarComSenha(a.email);
    expect(await digitar(codigoTotp(a.segredo, passoAtual()))).toBe("REDIRECT:/admin");
    expect(jar.has("dw_cliente")).toBe(true);
    expect(jar.has(COOKIE_2FA)).toBe(false);
  });

  it("respeita o destino pedido (passando por safeNext) e a senha provisória", async () => {
    const a = await adminComSegundoFator();
    await entrarComSenha(a.email);
    expect(await digitar(codigoTotp(a.segredo, passoAtual()), { next: "/carrinho" })).toBe("REDIRECT:/carrinho");
    jar.clear();
    await (await getDb()).update(customers).set({ mustChangePassword: true }).where(eq(customers.id, a.id));
    await entrarComSenha(a.email);
    expect(await digitar(codigoTotp(a.segredo, passoAtual() + 1))).toBe("REDIRECT:/conta?trocar=1");
  });

  it("código errado: erro, continua no passo do código e não abre sessão", async () => {
    const a = await adminComSegundoFator();
    await entrarComSenha(a.email);
    const r = (await digitar("000000")) as { error?: string; etapa?: string };
    expect(r).toMatchObject({ error: "Código incorreto, vencido ou já usado.", etapa: "codigo" });
    expect(jar.has("dw_cliente")).toBe(false);
  });

  it("o mesmo código não vale duas vezes (nem em outro login logo em seguida)", async () => {
    const a = await adminComSegundoFator();
    const codigo = codigoTotp(a.segredo, passoAtual());
    await entrarComSenha(a.email);
    expect(await digitar(codigo)).toBe("REDIRECT:/admin");
    jar.clear();
    await entrarComSenha(a.email);
    expect(await digitar(codigo)).toMatchObject({ error: expect.stringMatching(/já usado/) });
    expect(jar.has("dw_cliente")).toBe(false);
    // O código do passo seguinte (ainda dentro da tolerância) vale.
    expect(await digitar(codigoTotp(a.segredo, passoAtual() + 1))).toBe("REDIRECT:/admin");
  });

  it("5 erros bloqueiam a conta: nem o código certo passa mais", async () => {
    const a = await adminComSegundoFator();
    await entrarComSenha(a.email);
    for (let i = 0; i < 5; i++) await digitar("111111");
    const r = (await digitar(codigoTotp(a.segredo, passoAtual()))) as { error?: string };
    expect(r.error).toMatch(/Muitas tentativas/);
    expect(jar.has("dw_cliente")).toBe(false);
  });

  it("sem o bilhete (ou com ele vencido) não há como digitar o código", async () => {
    const a = await adminComSegundoFator();
    expect(await digitar(codigoTotp(a.segredo, passoAtual()))).toMatchObject({ reiniciar: true });
    // Bilhete feito há 10 minutos: vencido.
    jar.set(COOKIE_2FA, signDesafio2fa({ id: a.id, version: 2 }, SEGREDO_SITE, Date.now() - 10 * 60_000));
    expect(await digitar(codigoTotp(a.segredo, passoAtual()))).toMatchObject({ reiniciar: true });
    expect(jar.has("dw_cliente")).toBe(false);
  });

  it("bilhete adulterado ou de outro tipo não vale", async () => {
    const a = await adminComSegundoFator();
    await entrarComSenha(a.email);
    jar.set(COOKIE_2FA, `${jar.get(COOKIE_2FA)!}x`);
    expect(await digitar(codigoTotp(a.segredo, passoAtual()))).toMatchObject({ reiniciar: true });
  });

  it("o bilhete é de UMA conta: o código de outra conta não passa", async () => {
    const a = await adminComSegundoFator("a@exemplo.com");
    const b = await adminComSegundoFator("b@exemplo.com");
    await entrarComSenha(a.email);
    // A tenta usar o código do aparelho de B.
    const r = await digitar(codigoTotp(b.segredo, passoAtual()));
    expect(r).toMatchObject({ error: expect.any(String), etapa: "codigo" });
    expect(jar.has("dw_cliente")).toBe(false);
  });

  it("se a senha mudou depois de digitada (versão da conta avançou), o bilhete cai", async () => {
    const a = await adminComSegundoFator();
    await entrarComSenha(a.email);
    await changePassword(a.id, SENHA, "outra senha forte 456");
    expect(await digitar(codigoTotp(a.segredo, passoAtual()))).toMatchObject({ reiniciar: true });
    expect(jar.has(COOKIE_2FA)).toBe(false);
  });

  it("dois logins ao mesmo tempo com o mesmo código: só um passa", async () => {
    const a = await adminComSegundoFator();
    const codigo = codigoTotp(a.segredo, passoAtual());
    const r = await Promise.all([conferirSegundoFator(a.id, codigo), conferirSegundoFator(a.id, codigo), conferirSegundoFator(a.id, codigo)]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});

describe("o segredo e quem pode ligar", () => {
  it("fica cifrado no banco: o segredo em claro não aparece em nenhuma coluna", async () => {
    const a = await adminComSegundoFator();
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, a.id));
    expect(c.totpSecret).toMatch(/^v1\./);
    expect(JSON.stringify(c)).not.toContain(a.segredo);
  });

  it("só administradores têm segundo fator: cliente comum e conta inexistente são recusados", async () => {
    await clienteDeTeste("comum@exemplo.com");
    await expect(ligarSegundoFator("comum@exemplo.com")).rejects.toThrow(/Administrador não encontrado/);
    await expect(ligarSegundoFator("ninguem@exemplo.com")).rejects.toThrow(/Administrador não encontrado/);
    await expect(ligarSegundoFator("lixo")).rejects.toThrow();
  });

  it("refazer troca o segredo: o aparelho antigo deixa de valer", async () => {
    const a = await adminComSegundoFator();
    const novo = await ligarSegundoFator(a.email);
    expect(novo.segredo).not.toBe(a.segredo);
    expect(await conferirSegundoFator(a.id, codigoTotp(a.segredo, passoAtual()))).toBe(false);
    expect(await conferirSegundoFator(a.id, codigoTotp(novo.segredo, passoAtual()))).toBe(true);
  });

  it("desligar volta ao login só com senha; ligar/desligar derrubam as sessões abertas", async () => {
    const a = await adminComSegundoFator();
    const antes = (await (await getDb()).select({ v: customers.sessionVersion }).from(customers).where(eq(customers.id, a.id)))[0].v;
    expect(await desligarSegundoFator(a.email)).toBe("desligado");
    expect(await desligarSegundoFator(a.email)).toBe("nao-tinha");
    expect(await desligarSegundoFator("ninguem@exemplo.com")).toBe("nao-encontrado");
    const depois = (await (await getDb()).select({ v: customers.sessionVersion }).from(customers).where(eq(customers.id, a.id)))[0].v;
    expect(depois).toBeGreaterThan(antes);
    expect(await entrarComSenha(a.email)).toBe("REDIRECT:/admin");
  });

  it("tirar o papel de administrador apaga o segredo", async () => {
    const a = await adminComSegundoFator();
    await removeAdministrator(a.email);
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, a.id));
    expect(c.totpSecret).toBeNull();
    expect(c.role).toBe("cliente");
  });

  it("o banco recusa um segredo fora do formato cifrado", async () => {
    const id = await clienteDeTeste("x@exemplo.com");
    await expect((await getDb()).update(customers).set({ totpSecret: "ABCDEFGHIJKLMNOP" }).where(eq(customers.id, id))).rejects.toThrow();
  });
});
