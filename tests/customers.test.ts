// ============================================================================
// Testes dos DADOS DO CLIENTE (src/server/customers/index.ts): cadastro, login, troca de senha,
// saída de todos os aparelhos, exclusão de conta e senha provisória do painel.
// Por que testar: aqui nasce e morre a identidade do cliente. Os pontos que mais importam: e-mail
// "igual" nunca cria duas contas, senha errada nunca entra, e o hash da senha nunca sai daqui.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, orders } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import {
  anonymizeCustomer,
  authenticate,
  changePassword,
  getCustomer,
  parseRegisterForm,
  registerCustomer,
  setTemporaryPassword,
  signOutEverywhere,
} from "@/server/customers";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);

const SENHA = "minha senha forte 123";

/** Monta o formulário de cadastro, mudando só o que o teste quer. */
function form(o: Record<string, string | null> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string | null> = { name: "Ana Souza", email: "ana@exemplo.com", phone: "(11) 98765-4321", password: SENHA, privacy: "on", ...o };
  for (const [k, v] of Object.entries(base)) if (v !== null) f.set(k, v);
  return f;
}

/** Cadastra um cliente válido e devolve o id. */
async function criar(email = "ana@exemplo.com"): Promise<number> {
  const p = parseRegisterForm(form({ email }));
  if (!p.ok) throw new Error(p.error);
  const r = await registerCustomer(p.data);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("parseRegisterForm", () => {
  it("limpa e normaliza os campos", () => {
    const p = parseRegisterForm(form({ name: "  Ana   Souza ", email: "  Ana@Exemplo.COM ", phone: "+55 (11) 98765-4321" }));
    expect(p).toMatchObject({ ok: true, data: { name: "Ana Souza", email: "ana@exemplo.com", phone: "11987654321" } });
  });

  it.each([["1198765432"], ["(11) 3333-4444"], ["11987654321"]])("aceita o celular %s", (phone) => {
    expect(parseRegisterForm(form({ phone })).ok).toBe(true);
  });

  it.each([["98765-4321"], ["0119876543"], ["11887654321"], ["abc"], [""], ["119876543210123"]])("recusa o celular %j", (phone) => {
    expect(parseRegisterForm(form({ phone }))).toMatchObject({ ok: false, error: expect.stringMatching(/celular/i) });
  });

  // JS e Postgres minusculizam alguns caracteres não-ASCII de jeitos diferentes ("İ", por exemplo): o banco
  // recusaria o e-mail depois de a aplicação aceitar. Por isso só ASCII é aceito (endereços com acento
  // têm de vir em punycode, que já é ASCII).
  it.each([["ana@İstanbul.com"], ["josé@exemplo.com"], ["ana@exemplo.com​"], ["ana@exemplo.com x"]])("recusa o e-mail não ASCII %j", (email) => {
    expect(parseRegisterForm(form({ email }))).toMatchObject({ ok: false, error: expect.stringMatching(/e-mail/i) });
  });

  it.each([[""], ["ana"], ["ana@"], ["@x.com"], ["a b@x.com"], ["ana@x"], ["a@@x.com"], ["a".repeat(250) + "@x.com"]])("recusa o e-mail %j", (email) => {
    expect(parseRegisterForm(form({ email }))).toMatchObject({ ok: false, error: expect.stringMatching(/e-mail/i) });
  });

  it("recusa nome curto, longo ou vazio", () => {
    for (const name of ["", " ", "A", "A".repeat(81)]) {
      expect(parseRegisterForm(form({ name })), JSON.stringify(name)).toMatchObject({ ok: false, error: expect.stringMatching(/nome/i) });
    }
  });

  it("recusa senha fraca com o motivo", () => {
    expect(parseRegisterForm(form({ password: "curta" }))).toMatchObject({ ok: false, error: expect.stringMatching(/10 caracteres/) });
    expect(parseRegisterForm(form({ password: "ana@exemplo.com" }))).toMatchObject({ ok: false, error: expect.stringMatching(/e-mail/) });
  });

  it("exige o aceite da política de privacidade", () => {
    expect(parseRegisterForm(form({ privacy: null }))).toMatchObject({ ok: false, error: expect.stringMatching(/privacidade/i) });
    expect(parseRegisterForm(form({ privacy: "off" })).ok).toBe(false);
  });

  it("campos ausentes ou arquivos no lugar de texto não quebram", () => {
    const f = new FormData();
    f.set("name", new File(["x"], "x.txt"));
    expect(parseRegisterForm(f).ok).toBe(false);
    expect(parseRegisterForm(new FormData()).ok).toBe(false);
  });
});

describe("registerCustomer", () => {
  it("cria a conta e guarda só o hash da senha", async () => {
    const id = await criar();
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect(c).toMatchObject({ name: "Ana Souza", email: "ana@exemplo.com", phone: "11987654321", sessionVersion: 1, mustChangePassword: false });
    expect(c.passwordHash).toMatch(/^scrypt\$/);
    expect(c.passwordHash).not.toContain(SENHA);
    expect(c.privacyAcceptedAt).toBeInstanceOf(Date);
  });

  it("o mesmo e-mail, em outra caixa ou com espaços, é a mesma conta (não cria outra)", async () => {
    await criar("ana@exemplo.com");
    for (const email of ["ana@exemplo.com", "ANA@EXEMPLO.COM", "  Ana@Exemplo.com  "]) {
      const p = parseRegisterForm(form({ email }));
      if (!p.ok) throw new Error(p.error);
      expect(await registerCustomer(p.data), email).toMatchObject({ ok: false, error: expect.stringMatching(/já existe/i) });
    }
    expect(await (await getDb()).select().from(customers)).toHaveLength(1);
  });

  // Dois cadastros ao mesmo tempo com o mesmo e-mail: um vence, o outro recebe erro amigável (nunca um 500).
  it("cadastros SIMULTÂNEOS do mesmo e-mail resultam em uma conta e erros amigáveis", async () => {
    const p = parseRegisterForm(form());
    if (!p.ok) throw new Error(p.error);
    const r = await Promise.all(Array.from({ length: 5 }, () => registerCustomer(p.data)));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.filter((x) => !x.ok).every((x) => !x.ok && /já existe/i.test(x.error))).toBe(true);
    expect(await (await getDb()).select().from(customers)).toHaveLength(1);
  });
});

describe("authenticate", () => {
  it("senha certa entra (em qualquer caixa do e-mail)", async () => {
    const id = await criar();
    expect(await authenticate("ana@exemplo.com", SENHA)).toEqual({ id, sessionVersion: 1, mustChangePassword: false, role: "cliente" });
    expect(await authenticate("  ANA@exemplo.com ", SENHA)).toMatchObject({ id });
  });

  it("senha errada, e-mail inexistente, vazio e tipos estranhos não entram", async () => {
    await criar();
    expect(await authenticate("ana@exemplo.com", "senha errada 12345")).toBeNull();
    expect(await authenticate("outra@exemplo.com", SENHA)).toBeNull();
    expect(await authenticate("", "")).toBeNull();
    expect(await authenticate(undefined as unknown as string, SENHA)).toBeNull();
    expect(await authenticate("ana@exemplo.com", null as unknown as string)).toBeNull();
  });

  // Defesa em profundidade: mesmo se uma conta marcada como removida mantivesse e-mail e senha
  // válidos (um erro futuro na anonimização, por exemplo), o login ainda precisa recusá-la.
  it("conta marcada como anonimizada nunca entra, mesmo com e-mail e senha intactos", async () => {
    const id = await criar();
    await (await getDb()).update(customers).set({ anonymizedAt: new Date() }).where(eq(customers.id, id));
    expect(await authenticate("ana@exemplo.com", SENHA)).toBeNull();
    expect(await getCustomer(id)).toBeNull();
  });

  it("não deixa entrar com um pedaço de SQL no e-mail", async () => {
    await criar();
    expect(await authenticate("ana@exemplo.com' OR '1'='1", SENHA)).toBeNull();
  });
});

describe("getCustomer", () => {
  it("devolve os dados sem o hash da senha", async () => {
    const id = await criar();
    const c = await getCustomer(id);
    expect(c).toMatchObject({ id, name: "Ana Souza", email: "ana@exemplo.com", phone: "11987654321", sessionVersion: 1 });
    expect(JSON.stringify(c)).not.toMatch(/hash|scrypt/i);
  });

  it("devolve null para id inexistente ou inválido", async () => {
    for (const id of [999999, 0, -1, 1.5, NaN]) expect(await getCustomer(id), String(id)).toBeNull();
  });
});

describe("changePassword", () => {
  it("troca a senha, aumenta a versão da sessão e a senha antiga deixa de valer", async () => {
    const id = await criar();
    expect(await changePassword(id, SENHA, "outra senha forte 456")).toBe("ok");
    expect(await authenticate("ana@exemplo.com", SENHA)).toBeNull();
    expect(await authenticate("ana@exemplo.com", "outra senha forte 456")).toEqual({ id, sessionVersion: 2, mustChangePassword: false, role: "cliente" });
  });

  it("senha atual errada ou senha nova inválida não mudam nada", async () => {
    const id = await criar();
    expect(await changePassword(id, "errada errada 1", "outra senha forte 456")).toBe("senha-atual");
    expect(await changePassword(id, SENHA, "curta")).toBe("invalida");
    expect(await changePassword(id, SENHA, "ana@exemplo.com")).toBe("invalida");
    expect(await authenticate("ana@exemplo.com", SENHA)).toMatchObject({ sessionVersion: 1 });
  });

  // Se a versão da sessão mudou no meio (outro aparelho saiu de tudo), a troca não pode sobrescrever nada
  // nem culpar a pessoa dizendo que a senha atual estava errada: ela estava certa. O resultado é "conflito".
  it("corrida com 'sair de todos os aparelhos' devolve conflito, não 'senha atual errada'", async () => {
    const id = await criar();
    const troca = changePassword(id, SENHA, "outra senha forte 456");
    await new Promise((r) => setTimeout(r, 20)); // deixa a troca ler a conta e começar a verificar a senha
    await signOutEverywhere(id);
    expect(await troca).toBe("conflito");
    // A senha continua sendo a antiga.
    expect(await authenticate("ana@exemplo.com", SENHA)).toMatchObject({ id });
  });

  it("conta inexistente ou anonimizada não troca nada", async () => {
    expect(await changePassword(999999, SENHA, "outra senha forte 456")).toBe("senha-atual");
    const id = await criar();
    await anonymizeCustomer(id);
    expect(await changePassword(id, SENHA, "outra senha forte 456")).toBe("senha-atual");
  });
});

describe("signOutEverywhere", () => {
  it("aumenta a versão da sessão a cada chamada", async () => {
    const id = await criar();
    expect(await signOutEverywhere(id)).toBe(2);
    expect(await signOutEverywhere(id)).toBe(3);
    expect((await getCustomer(id))?.sessionVersion).toBe(3);
  });
});

describe("anonymizeCustomer", () => {
  it("apaga os dados pessoais, tira o acesso e MANTÉM os pedidos", async () => {
    const id = await criar();
    const pedido = await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }], id);
    await anonymizeCustomer(id);

    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect(c).toMatchObject({ name: "Cliente removido", email: `removido-${id}@invalid`, phone: "" });
    expect(c.anonymizedAt).toBeInstanceOf(Date);
    expect(c.sessionVersion).toBe(2);
    expect(await authenticate("ana@exemplo.com", SENHA)).toBeNull();
    expect(await getCustomer(id)).toBeNull();

    const [o] = await (await getDb()).select().from(orders).where(eq(orders.id, pedido.id));
    expect(o.customerId).toBe(id); // o pedido continua ligado à conta anonimizada
  });

  it("libera o e-mail: dá para cadastrar de novo com ele", async () => {
    const id = await criar();
    await anonymizeCustomer(id);
    expect(await criar()).not.toBe(id);
  });
});

describe("setTemporaryPassword", () => {
  it("gera uma senha provisória que entra uma vez e obriga a troca", async () => {
    const id = await criar();
    const temp = await setTemporaryPassword(id);
    expect(temp).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(await authenticate("ana@exemplo.com", SENHA)).toBeNull(); // a antiga deixa de valer
    expect(await authenticate("ana@exemplo.com", temp)).toEqual({ id, sessionVersion: 2, mustChangePassword: true, role: "cliente" });
    // Trocar a senha limpa a obrigação.
    expect(await changePassword(id, temp, "senha definitiva 789")).toBe("ok");
    expect(await authenticate("ana@exemplo.com", "senha definitiva 789")).toMatchObject({ mustChangePassword: false });
  });

  it("cada chamada gera uma senha diferente", async () => {
    const id = await criar();
    expect(await setTemporaryPassword(id)).not.toBe(await setTemporaryPassword(id));
  });

  it("recusa conta inexistente ou anonimizada", async () => {
    await expect(setTemporaryPassword(999999)).rejects.toThrow(/conta/i);
    const id = await criar();
    await anonymizeCustomer(id);
    await expect(setTemporaryPassword(id)).rejects.toThrow(/conta/i);
  });
});
