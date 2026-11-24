// ============================================================================
// Testes das AÇÕES do cliente (src/app/actions-cliente.ts): cadastro, entrada, saída, troca de senha,
// "sair de todos os aparelhos" e exclusão de conta.
// Por que testar: é a porta de entrada das contas. Aqui moram o limite de tentativas contra quem
// adivinha senhas, o destino seguro depois do login e a certeza de que a senha nunca volta para a tela.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, rateLimits } from "@/server/db/schema";
import { authenticate, getCustomer, registerCustomer, parseRegisterForm } from "@/server/customers";
import { COOKIE_CLIENTE, currentCustomer, signSession, startCustomerSession } from "@/server/customers/session";
import {
  changePasswordAction,
  deleteAccountAction,
  loginAction,
  logoutAction,
  registerAction,
  signOutEverywhereAction,
} from "@/app/actions-cliente";
import { resetDb } from "./helpers/db";

// ---------- o "navegador" de mentira ----------
const jar = new Map<string, string>();
let cabecalhos: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (o: { name: string }) => void jar.delete(o.name),
  }),
  headers: async () => new Headers(cabecalhos),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const SENHA = "minha senha forte 123";
const SEGREDO = process.env.CUSTOMER_SESSION_SECRET as string;

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(rateLimits);
  jar.clear();
  cabecalhos = { "x-real-ip": "10.0.0.1" };
});

/** Monta um FormData a partir de um objeto. */
function form(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

const cadastro = (o: Record<string, string> = {}) =>
  form({ name: "Ana Souza", email: "ana@exemplo.com", phone: "(11) 98765-4321", password: SENHA, privacy: "on", ...o });

/** Cria um cliente direto (sem passar pelas ações) e devolve o id. */
async function criar(email = "ana@exemplo.com"): Promise<number> {
  const p = parseRegisterForm(cadastro({ email }));
  if (!p.ok) throw new Error(p.error);
  const r = await registerCustomer(p.data);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

/** Roda uma ação e devolve o destino do redirecionamento, ou o estado devolvido. */
async function rodar<T>(f: () => Promise<T>): Promise<{ destino: string } | { estado: T }> {
  try {
    return { estado: await f() };
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec(e instanceof Error ? e.message : "");
    if (m) return { destino: m[1] };
    throw e;
  }
}

describe("registerAction", () => {
  it("cria a conta, abre a sessão e leva a /conta", async () => {
    const r = await rodar(() => registerAction({}, cadastro()));
    expect(r).toEqual({ destino: "/conta" });
    expect(jar.has(COOKIE_CLIENTE)).toBe(true);
    expect(await currentCustomer()).toMatchObject({ email: "ana@exemplo.com" });
  });

  it("volta para onde a pessoa estava (a sacola), mas nunca para outro site", async () => {
    expect(await rodar(() => registerAction({}, cadastro({ next: "/carrinho" })))).toEqual({ destino: "/carrinho" });
    jar.clear();
    expect(await rodar(() => registerAction({}, cadastro({ email: "b@exemplo.com", next: "https://outro.site" })))).toEqual({ destino: "/conta" });
  });

  it("e-mail repetido: erro amigável, sem sessão", async () => {
    await criar();
    const r = await rodar(() => registerAction({}, cadastro()));
    expect(r).toMatchObject({ estado: { error: expect.stringMatching(/já existe/i) } });
    expect(jar.has(COOKIE_CLIENTE)).toBe(false);
  });

  it("erro de validação mantém nome, e-mail e celular, mas NUNCA devolve a senha", async () => {
    const r = await rodar(() => registerAction({}, cadastro({ password: "curta", name: "Ana Souza" })));
    expect(r).toMatchObject({ estado: { error: expect.stringMatching(/10 caracteres/) } });
    const estado = (r as { estado: { values?: Record<string, string> } }).estado;
    expect(estado.values).toMatchObject({ name: "Ana Souza", email: "ana@exemplo.com" });
    expect(JSON.stringify(estado)).not.toContain("curta");
    expect(estado.values && "password" in estado.values).toBe(false);
  });

  it("limita cadastros por origem: o 6º em uma hora é recusado, sem criar conta", async () => {
    for (let i = 0; i < 5; i++) await rodar(() => registerAction({}, cadastro({ email: `u${i}@exemplo.com` })));
    jar.clear();
    const r = await rodar(() => registerAction({}, cadastro({ email: "u6@exemplo.com" })));
    expect(r).toMatchObject({ estado: { error: expect.stringMatching(/muitos/i) } });
    expect((await (await getDb()).select().from(customers)).length).toBe(5);
  });
});

describe("loginAction", () => {
  it("senha certa abre a sessão e leva ao destino seguro", async () => {
    await criar();
    expect(await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: SENHA, next: "/conta/pedidos" })))).toEqual({ destino: "/conta/pedidos" });
    expect(await currentCustomer()).toMatchObject({ email: "ana@exemplo.com" });
  });

  it("destino perigoso no 'next' vira /conta", async () => {
    await criar();
    for (const next of ["https://outro.site", "//outro.site", "/admin", "javascript:alert(1)", "/conta/../admin"]) {
      jar.clear();
      expect(await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: SENHA, next }))), next).toEqual({ destino: "/conta" });
    }
  });

  it("senha errada e e-mail inexistente dão EXATAMENTE a mesma mensagem, e só o e-mail volta ao formulário", async () => {
    await criar();
    const a = await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: "senha errada 123" })));
    const b = await rodar(() => loginAction({}, form({ email: "naoexiste@exemplo.com", password: "senha errada 123" })));
    expect(a).toMatchObject({ estado: { error: "E-mail ou senha incorretos." } });
    expect((a as { estado: { error: string } }).estado.error).toBe((b as { estado: { error: string } }).estado.error);
    expect((a as { estado: { values: unknown } }).estado.values).toEqual({ email: "ana@exemplo.com" });
    expect(JSON.stringify(a)).not.toContain("senha errada");
    expect(jar.has(COOKIE_CLIENTE)).toBe(false);
  });

  it("o 6º erro no mesmo e-mail bloqueia, mesmo vindo de origens diferentes, e a senha certa também fica de fora", async () => {
    await criar();
    for (let i = 0; i < 5; i++) {
      cabecalhos = { "x-real-ip": `10.0.1.${i}` }; // origens diferentes: o limite é POR E-MAIL
      await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: `errada ${i} senha 1` })));
    }
    cabecalhos = { "x-real-ip": "10.0.2.9" };
    const r = await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: SENHA })));
    expect(r).toMatchObject({ estado: { error: expect.stringMatching(/muitas tentativas/i) } });
    expect(jar.has(COOKIE_CLIENTE)).toBe(false);
  });

  it("o bloqueio vale para o e-mail em qualquer caixa e com espaços", async () => {
    await criar();
    for (let i = 0; i < 5; i++) await rodar(() => loginAction({}, form({ email: i % 2 ? " ANA@exemplo.com " : "ana@exemplo.com", password: `errada ${i} senha 1` })));
    expect(await rodar(() => loginAction({}, form({ email: "Ana@Exemplo.com", password: SENHA })))).toMatchObject({ estado: { error: expect.stringMatching(/muitas tentativas/i) } });
  });

  it("entrar com sucesso zera as falhas daquele e-mail", async () => {
    await criar();
    for (let i = 0; i < 4; i++) await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: `errada ${i} senha 1` })));
    expect(await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: SENHA })))).toEqual({ destino: "/conta" });
    jar.clear();
    // Outra origem, para o limite por ORIGEM (8) não interferir: aqui só o limite por e-mail está em jogo.
    cabecalhos = { "x-real-ip": "10.0.3.3" };
    // Depois do sucesso, 4 erros novos ainda não bloqueiam.
    for (let i = 0; i < 4; i++) await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: `errada ${i} senha 1` })));
    expect(await rodar(() => loginAction({}, form({ email: "ana@exemplo.com", password: SENHA })))).toEqual({ destino: "/conta" });
  });

  it("limita tentativas por origem: a 9ª em 15 minutos é recusada, mesmo com e-mails diferentes", async () => {
    for (let i = 0; i < 8; i++) await rodar(() => loginAction({}, form({ email: `x${i}@exemplo.com`, password: "qualquer senha 123" })));
    const r = await rodar(() => loginAction({}, form({ email: "x9@exemplo.com", password: "qualquer senha 123" })));
    expect(r).toMatchObject({ estado: { error: expect.stringMatching(/muitas tentativas/i) } });
  });

  it("campos ausentes ou arquivos no lugar de texto não quebram", async () => {
    const f = new FormData();
    f.set("email", new File(["x"], "x.txt"));
    expect(await rodar(() => loginAction({}, f))).toMatchObject({ estado: { error: "E-mail ou senha incorretos." } });
    expect(await rodar(() => loginAction({}, new FormData()))).toMatchObject({ estado: { error: "E-mail ou senha incorretos." } });
  });
});

describe("logoutAction", () => {
  it("apaga o cookie e volta para a página inicial", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    expect(await rodar(() => logoutAction())).toEqual({ destino: "/" });
    expect(jar.has(COOKIE_CLIENTE)).toBe(false);
  });
});

describe("ações que exigem conta", () => {
  it("sem sessão, mandam para a entrada (a ação pode ser chamada direto, sem a página)", async () => {
    const acoes: (() => Promise<unknown>)[] = [() => changePasswordAction({}, form({})), () => signOutEverywhereAction(), () => deleteAccountAction({}, form({}))];
    for (const f of acoes) {
      expect(await rodar(f)).toMatchObject({ destino: expect.stringMatching(/^\/conta\/entrar/) });
    }
  });
});

describe("changePasswordAction", () => {
  const trocar = (o: Record<string, string>) => changePasswordAction({}, form({ current: SENHA, next: "outra senha forte 456", confirm: "outra senha forte 456", ...o }));

  it("troca a senha, derruba os outros aparelhos e mantém este logado", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    const cookieDeOutroAparelho = signSession({ id, version: 1, exp: Date.now() + 3600_000 }, SEGREDO);
    expect(await rodar(() => trocar({}))).toMatchObject({ estado: { ok: expect.stringMatching(/senha/i) } });

    expect(await authenticate("ana@exemplo.com", "outra senha forte 456")).toMatchObject({ id });
    expect(await authenticate("ana@exemplo.com", SENHA)).toBeNull();
    expect(await currentCustomer()).toMatchObject({ id }); // este aparelho continua logado (versão nova)
    jar.set(COOKIE_CLIENTE, cookieDeOutroAparelho); // o cookie antigo de outro aparelho
    expect(await currentCustomer()).toBeNull();
  });

  it.each([
    ["senha atual errada", { current: "errada errada 12" }, /atual/i],
    ["confirmação diferente", { confirm: "diferente diferente 1" }, /confirma/i],
    ["senha nova fraca", { next: "curta", confirm: "curta" }, /10 caracteres/],
    ["senha nova igual ao e-mail", { next: "ana@exemplo.com", confirm: "ana@exemplo.com" }, /e-mail/],
  ])("%s: erro claro e nada muda", async (_n, campos, erro) => {
    const id = await criar();
    await startCustomerSession(id, 1);
    expect(await rodar(() => trocar(campos))).toMatchObject({ estado: { error: expect.stringMatching(erro) } });
    expect(await authenticate("ana@exemplo.com", SENHA)).toMatchObject({ id, sessionVersion: 1 });
  });

  it("limita tentativas de senha atual: a 6ª em 15 minutos é recusada, mesmo com a senha certa", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    for (let i = 0; i < 5; i++) await rodar(() => trocar({ current: `errada ${i} senha 1` }));
    expect(await rodar(() => trocar({}))).toMatchObject({ estado: { error: expect.stringMatching(/muitas tentativas/i) } });
    expect(await authenticate("ana@exemplo.com", SENHA)).toMatchObject({ id });
  });

  it("nenhuma senha volta no estado devolvido", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    const r = await rodar(() => trocar({ current: "errada errada 12" }));
    expect(JSON.stringify(r)).not.toMatch(/errada errada|outra senha forte|minha senha forte/);
  });
});

describe("signOutEverywhereAction", () => {
  it("derruba os outros aparelhos e mantém este", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    const outro = signSession({ id, version: 1, exp: Date.now() + 3600_000 }, SEGREDO);
    await signOutEverywhereAction();
    expect(await currentCustomer()).toMatchObject({ id });
    jar.set(COOKIE_CLIENTE, outro);
    expect(await currentCustomer()).toBeNull();
  });
});

describe("deleteAccountAction", () => {
  it("com a senha certa, anonimiza a conta, encerra a sessão e leva à página inicial", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    expect(await rodar(() => deleteAccountAction({}, form({ password: SENHA })))).toEqual({ destino: "/" });
    expect(jar.has(COOKIE_CLIENTE)).toBe(false);
    expect(await getCustomer(id)).toBeNull();
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect(c.anonymizedAt).toBeInstanceOf(Date);
  });

  it("com a senha errada ou vazia, NADA é apagado", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    for (const password of ["errada errada 12", ""]) {
      expect(await rodar(() => deleteAccountAction({}, form({ password })))).toMatchObject({ estado: { error: expect.stringMatching(/senha/i) } });
    }
    expect(await getCustomer(id)).toMatchObject({ id });
  });

  it("limita tentativas de senha: a 6ª é recusada mesmo com a senha certa", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    for (let i = 0; i < 5; i++) await rodar(() => deleteAccountAction({}, form({ password: `errada ${i} senha 1` })));
    expect(await rodar(() => deleteAccountAction({}, form({ password: SENHA })))).toMatchObject({ estado: { error: expect.stringMatching(/muitas tentativas/i) } });
    expect(await getCustomer(id)).toMatchObject({ id });
  });
});
