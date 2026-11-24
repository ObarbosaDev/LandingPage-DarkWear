// ============================================================================
// Testes da SESSÃO do cliente (src/server/customers/session.ts): token assinado, cookie, leitura da
// conta logada e o redirecionamento seguro depois do login.
// Por que testar: é o que prova "quem é você" em cada pedido. Um erro aqui deixaria alguém agir
// como outro cliente, ou manteria logado quem já trocou a senha.
// ============================================================================

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymizeCustomer, parseRegisterForm, registerCustomer, signOutEverywhere } from "@/server/customers";
import {
  COOKIE_CLIENTE,
  currentCustomer,
  endCustomerSession,
  requireCustomer,
  safeNext,
  signSession,
  startCustomerSession,
  verifySession,
} from "@/server/customers/session";
import { resetDb } from "./helpers/db";

// ---------- o "navegador" de mentira: um pote de cookies e um redirect que lança ----------

const jar = new Map<string, string>();
const gravados: { nome: string; valor: string; opts: Record<string, unknown> }[] = [];
const apagados: Record<string, unknown>[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string, opts: Record<string, unknown>) => {
      jar.set(n, v);
      gravados.push({ nome: n, valor: v, opts });
    },
    delete: (o: { name: string } & Record<string, unknown>) => {
      jar.delete(o.name);
      apagados.push(o);
    },
  }),
}));
// redirect() de verdade lança um erro especial; aqui lança um erro com o destino, para o teste ler.
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const SEGREDO = "segredo-de-sessao-do-cliente-com-mais-de-32-caracteres";

beforeEach(async () => {
  await resetDb();
  jar.clear();
  gravados.length = 0;
  apagados.length = 0;
  process.env.CUSTOMER_SESSION_SECRET = SEGREDO;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  process.env.CUSTOMER_SESSION_SECRET = SEGREDO;
});

async function criar(email = "ana@exemplo.com"): Promise<number> {
  const f = new FormData();
  for (const [k, v] of Object.entries({ name: "Ana Souza", email, phone: "11987654321", password: "minha senha forte 123", privacy: "on" })) f.set(k, v);
  const p = parseRegisterForm(f);
  if (!p.ok) throw new Error(p.error);
  const r = await registerCustomer(p.data);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

const agora = () => Date.now();
const emUmaHora = () => agora() + 3600_000;

describe("signSession e verifySession", () => {
  it("o token assinado volta com o id, a versão e o horário do login (iat)", () => {
    const antes = Date.now();
    const t = signSession({ id: 7, version: 3, exp: emUmaHora() }, SEGREDO);
    expect(verifySession(t, SEGREDO)).toEqual({ id: 7, version: 3, iat: expect.any(Number) });
    expect(verifySession(t, SEGREDO)!.iat).toBeGreaterThanOrEqual(antes);
  });

  it("o horário do login informado é o que volta, e não se confunde com a validade", () => {
    const t = signSession({ id: 7, version: 3, exp: emUmaHora() }, SEGREDO, 12345);
    expect(verifySession(t, SEGREDO)?.iat).toBe(12345);
  });

  // Cookies de antes desta regra não tinham iat: valem para o site, mas contam como login antigo para o painel.
  it("token sem iat devolve iat 0 (login antigo)", () => {
    const dados = Buffer.from(JSON.stringify({ id: 7, v: 3, exp: Date.now() + 3600_000 })).toString("base64url");
    const assinatura = createHmac("sha256", SEGREDO).update(`cliente.${dados}`).digest("base64url");
    expect(verifySession(`${dados}.${assinatura}`, SEGREDO)).toEqual({ id: 7, version: 3, iat: 0 });
  });

  it("recusa assinatura adulterada, segredo diferente e dados trocados", () => {
    const t = signSession({ id: 7, version: 3, exp: emUmaHora() }, SEGREDO);
    expect(verifySession(t, "outro-segredo-com-mais-de-32-caracteres-123")).toBeNull();
    expect(verifySession(t.slice(0, -2) + "xx", SEGREDO)).toBeNull();
    // Troca o id dentro dos dados mantendo a assinatura antiga: tem de falhar.
    const [dados, assinatura] = t.split(".");
    const outro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(dados, "base64url").toString()), id: 8 })).toString("base64url");
    expect(verifySession(`${outro}.${assinatura}`, SEGREDO)).toBeNull();
  });

  it("recusa token vencido (e aceita um instante antes do vencimento)", () => {
    const exp = 1_000_000;
    const t = signSession({ id: 1, version: 1, exp }, SEGREDO);
    expect(verifySession(t, SEGREDO, exp - 1)).toMatchObject({ id: 1, version: 1 });
    expect(verifySession(t, SEGREDO, exp)).toBeNull();
    expect(verifySession(t, SEGREDO, exp + 1)).toBeNull();
  });

  it("recusa validade exagerada (mais de 31 dias): um token assim não foi feito por nós", () => {
    const t = signSession({ id: 1, version: 1, exp: agora() + 40 * 24 * 3600_000 }, SEGREDO);
    expect(verifySession(t, SEGREDO)).toBeNull();
  });

  it.each(["", ".", "abc", "a.b.c", "a.", ".b", "x".repeat(5000), "%%%.%%%"])("recusa token malformado %j", (t) => {
    expect(verifySession(t, SEGREDO)).toBeNull();
  });

  it("recusa id e versão inválidos mesmo com assinatura correta", () => {
    for (const [id, version] of [[0, 1], [-1, 1], [1.5, 1], [1, 0], [1, 1.5], [NaN, 1], ["1", 1], [1, "1"], [null, 1], [Number.MAX_SAFE_INTEGER + 1, 1]]) {
      const t = signSession({ id, version, exp: emUmaHora() } as never, SEGREDO);
      expect(verifySession(t, SEGREDO), JSON.stringify([id, version])).toBeNull();
    }
  });

  it("segredo curto ou vazio nunca valida nem assina", () => {
    expect(() => signSession({ id: 1, version: 1, exp: emUmaHora() }, "curto")).toThrow(/32/);
    const t = signSession({ id: 1, version: 1, exp: emUmaHora() }, SEGREDO);
    expect(verifySession(t, "")).toBeNull();
    expect(verifySession(t, "curto")).toBeNull();
  });

});

describe("cookie da sessão", () => {
  it("startCustomerSession grava o cookie com as proteções certas", async () => {
    await startCustomerSession(5, 2);
    expect(gravados).toHaveLength(1);
    expect(gravados[0].nome).toBe(COOKIE_CLIENTE);
    expect(gravados[0].opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
    expect(verifySession(gravados[0].valor, SEGREDO)).toMatchObject({ id: 5, version: 2 });
  });

  it("o cookie só é 'secure' em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await startCustomerSession(5, 2);
    expect(gravados[0].opts.secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    await startCustomerSession(5, 2);
    expect(gravados[1].opts.secure).toBe(false);
  });

  it("sem segredo configurado, não abre sessão (e diz por quê)", async () => {
    delete process.env.CUSTOMER_SESSION_SECRET;
    await expect(startCustomerSession(5, 1)).rejects.toThrow(/CUSTOMER_SESSION_SECRET/);
    expect(gravados).toHaveLength(0);
  });

  it("endCustomerSession apaga o cookie no mesmo caminho em que foi gravado", async () => {
    await startCustomerSession(5, 1);
    await endCustomerSession();
    expect(jar.has(COOKIE_CLIENTE)).toBe(false);
    expect(apagados[0]).toMatchObject({ name: COOKIE_CLIENTE, path: "/" });
  });
});

describe("currentCustomer", () => {
  it("devolve a conta logada, sem o hash da senha", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    const c = await currentCustomer();
    expect(c).toMatchObject({ id, email: "ana@exemplo.com", name: "Ana Souza" });
    expect(JSON.stringify(c)).not.toMatch(/hash|scrypt/i);
  });

  it("sem cookie, com cookie vazio ou lixo: ninguém logado", async () => {
    expect(await currentCustomer()).toBeNull();
    jar.set(COOKIE_CLIENTE, "");
    expect(await currentCustomer()).toBeNull();
    jar.set(COOKIE_CLIENTE, "lixo.lixo");
    expect(await currentCustomer()).toBeNull();
  });

  it("sem segredo configurado, ninguém está logado (nunca 'aberto')", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    delete process.env.CUSTOMER_SESSION_SECRET;
    expect(await currentCustomer()).toBeNull();
  });

  // O ponto central da versão da sessão: trocar a senha ou "sair de todos os aparelhos" derruba os cookies antigos.
  it("cookie com versão antiga deixa de valer depois de 'sair de todos os aparelhos'", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    expect(await currentCustomer()).not.toBeNull();
    await signOutEverywhere(id);
    expect(await currentCustomer()).toBeNull();
    // Abrir de novo com a versão nova volta a valer.
    await startCustomerSession(id, 2);
    expect(await currentCustomer()).not.toBeNull();
  });

  it("cookie com versão MAIOR que a da conta também não vale (só a versão exata)", async () => {
    const id = await criar();
    await startCustomerSession(id, 99);
    expect(await currentCustomer()).toBeNull();
  });

  it("conta anonimizada ou id inexistente nunca autentica", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    await anonymizeCustomer(id);
    expect(await currentCustomer()).toBeNull();
    jar.clear();
    await startCustomerSession(999999, 1);
    expect(await currentCustomer()).toBeNull();
  });

  it("cookie vencido não vale", async () => {
    const id = await criar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await startCustomerSession(id, 1);
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z")); // 31 dias depois (vale 30)
    expect(await currentCustomer()).toBeNull();
  });
});

describe("requireCustomer", () => {
  it("devolve a conta quando há sessão", async () => {
    const id = await criar();
    await startCustomerSession(id, 1);
    expect(await requireCustomer()).toMatchObject({ id });
  });

  it("sem sessão, manda para a entrada guardando para onde voltar", async () => {
    await expect(requireCustomer("/carrinho")).rejects.toThrow("REDIRECT:/conta/entrar?next=%2Fcarrinho");
    await expect(requireCustomer()).rejects.toThrow("REDIRECT:/conta/entrar?next=%2Fconta");
  });

  it("um destino perigoso no pedido de login nunca vira destino", async () => {
    await expect(requireCustomer("https://outro.site")).rejects.toThrow("REDIRECT:/conta/entrar?next=%2Fconta");
  });
});

describe("safeNext", () => {
  it.each([["/carrinho"], ["/conta"], ["/conta/pedidos"], ["/conta/pedidos/DW-00001"], ["/carrinho?a=1"], ["/conta#topo"]])("aceita %j", (destino) => {
    expect(safeNext(destino)).toBe(destino);
  });

  it.each([
    ["https://outro.site"],
    ["http://outro.site/conta"],
    ["//outro.site"],
    ["///outro.site"],
    ["/\\outro.site"],
    ["\\\\outro.site"],
    ["/admin"],
    ["/admin/pedidos"],
    ["/contaX"],
    ["/carrinhos"],
    ["/conta/../admin"],
    ["/conta/%2e%2e/admin"],
    ["/conta/%2E%2E/admin"],
    ["/conta/%5c%5couter.site"],
    ["/conta/%2f%2fouter.site"],
    ["javascript:alert(1)"],
    ["data:text/html,x"],
    [" /conta"],
    ["/conta\n"],
    ["/conta\r\nSet-Cookie: x=1"],
    ["/conta\u0000"],
    ["conta"],
    [""],
  ])("recusa %j e usa o padrão", (destino) => {
    expect(safeNext(destino)).toBe("/conta");
  });

  it("tipos que não são texto usam o padrão", () => {
    for (const v of [null, undefined, 1, {}, ["/conta"], true]) expect(safeNext(v), String(v)).toBe("/conta");
  });

  it("o padrão pode ser trocado", () => {
    expect(safeNext("https://x", "/carrinho")).toBe("/carrinho");
  });
});
