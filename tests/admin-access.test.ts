// ============================================================================
// Testes do ACESSO AO PAINEL (src/server/admin/auth.ts): só administradores, só com login recente, e
// sem revelar que o painel existe.
// Por que testar: o painel mexe em preços, estoque e pedidos de todos. Um erro aqui entrega a loja a quem
// não devia. O desenho: o painel NÃO tem senha própria; o administrador é uma conta com papel "admin" que
// entra pela mesma tela de todo mundo. Quem não é administrador recebe "não encontrado" (404), igual a
// qualquer endereço que não existe: nada indica que há um painel ali.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, rateLimits } from "@/server/db/schema";
import { anonymizeCustomer, signOutEverywhere } from "@/server/customers";
import { startCustomerSession, currentSession } from "@/server/customers/session";
import { isAdmin, requireAdmin, SESSAO_ADMIN_HORAS } from "@/server/admin/auth";
import { changePasswordAction, deleteAccountAction, loginAction, registerAction, signOutEverywhereAction } from "@/app/actions-cliente";
import { hashPassword } from "@/server/customers/password";
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

const HORA = 3600_000;
const SENHA = "minha senha forte 123";

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(rateLimits);
  jar.clear();
});

/** Cria um administrador (conta com papel "admin") e devolve o id. */
async function criarAdmin(email = "admin@exemplo.com"): Promise<number> {
  const id = await clienteDeTeste(email);
  await (await getDb()).update(customers).set({ role: "admin", passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, id));
  return id;
}

/** Abre a sessão como se o login tivesse sido feito há "horasAtras" horas. */
async function entrarComo(id: number, horasAtras = 0, version = 1) {
  await startCustomerSession(id, version, Date.now() - horasAtras * HORA);
}

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const resultado = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
    return "OK";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

describe("requireAdmin", () => {
  it("anônimo recebe 404 (não há pista de que existe um painel)", async () => {
    expect(await resultado(requireAdmin)).toBe("NOT_FOUND");
  });

  it("cliente comum logado também recebe 404", async () => {
    const id = await clienteDeTeste("cliente@exemplo.com");
    await entrarComo(id);
    expect(await resultado(requireAdmin)).toBe("NOT_FOUND");
  });

  it("administrador com login recente entra", async () => {
    const id = await criarAdmin();
    await entrarComo(id, 1);
    expect(await requireAdmin()).toMatchObject({ id, role: "admin" });
  });

  it("o login de admin vale por 12 horas: 11h59 passa, 12h01 pede para entrar de novo", async () => {
    expect(SESSAO_ADMIN_HORAS).toBe(12);
    const id = await criarAdmin();
    await entrarComo(id, 11.98);
    expect(await resultado(requireAdmin)).toBe("OK");
    await entrarComo(id, 12.02);
    expect(await resultado(requireAdmin)).toBe("REDIRECT:/conta/entrar?reentrar=1");
  });

  it("cookie de uma sessão antiga (versão que já avançou) recebe 404", async () => {
    const id = await criarAdmin();
    await entrarComo(id);
    await signOutEverywhere(id);
    expect(await resultado(requireAdmin)).toBe("NOT_FOUND");
  });

  it("conta de admin anonimizada recebe 404", async () => {
    const id = await criarAdmin();
    await entrarComo(id);
    await anonymizeCustomer(id);
    expect(await resultado(requireAdmin)).toBe("NOT_FOUND");
  });

  it("admin com senha provisória é levado a trocá-la antes de usar o painel", async () => {
    const id = await criarAdmin();
    await (await getDb()).update(customers).set({ mustChangePassword: true }).where(eq(customers.id, id));
    await entrarComo(id);
    expect(await resultado(requireAdmin)).toBe("REDIRECT:/conta?trocar=1");
  });

  it("um cookie sem 'iat' (de antes desta regra) nunca vale para o painel", async () => {
    const id = await criarAdmin();
    const { signSession } = await import("@/server/customers/session");
    const antigo = signSession({ id, version: 1, exp: Date.now() + HORA }, process.env.CUSTOMER_SESSION_SECRET as string, 0);
    jar.set("dw_cliente", antigo.replace(/^.*$/, antigo));
    expect(await resultado(requireAdmin)).toBe("REDIRECT:/conta/entrar?reentrar=1");
  });
});

describe("isAdmin", () => {
  it("é sim só para administrador com login recente", async () => {
    expect(await isAdmin()).toBe(false);
    const cliente = await clienteDeTeste("c@exemplo.com");
    await entrarComo(cliente);
    expect(await isAdmin()).toBe(false);
    const admin = await criarAdmin();
    await entrarComo(admin);
    expect(await isAdmin()).toBe(true);
    await entrarComo(admin, 13);
    expect(await isAdmin()).toBe(false);
  });
});

describe("o papel de administrador nunca vem de formulário", () => {
  it("o cadastro ignora um campo 'role' enviado", async () => {
    const r = await resultado(() =>
      registerAction({}, form({ name: "Mal Intencionado", email: "mal@exemplo.com", phone: "11987654321", password: SENHA, privacy: "on", role: "admin", is_admin: "true", admin: "1" })),
    );
    expect(r).toBe("REDIRECT:/conta");
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.email, "mal@exemplo.com"));
    expect(c.role).toBe("cliente");
    expect(await isAdmin()).toBe(false);
  });

  it("trocar a senha não mexe no papel", async () => {
    const id = await clienteDeTeste("c2@exemplo.com");
    await (await getDb()).update(customers).set({ passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, id));
    await entrarComo(id);
    await changePasswordAction({}, form({ current: SENHA, next: "outra senha forte 456", confirm: "outra senha forte 456", role: "admin" }));
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect(c.role).toBe("cliente");
  });

  it("o banco recusa um papel inventado", async () => {
    const id = await clienteDeTeste("c3@exemplo.com");
    await expect((await getDb()).update(customers).set({ role: "dono" as never }).where(eq(customers.id, id))).rejects.toThrow();
  });
});

describe("loginAction leva cada pessoa ao seu lugar", () => {
  it("administrador, sem destino pedido, vai para o painel", async () => {
    await criarAdmin();
    expect(await resultado(() => loginAction({}, form({ email: "admin@exemplo.com", password: SENHA })))).toBe("REDIRECT:/admin");
    expect(await isAdmin()).toBe(true);
  });

  it("cliente comum vai para a conta, e '?next=/admin' NÃO o leva ao painel", async () => {
    const id = await clienteDeTeste("cli@exemplo.com");
    await (await getDb()).update(customers).set({ passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, id));
    expect(await resultado(() => loginAction({}, form({ email: "cli@exemplo.com", password: SENHA, next: "/admin" })))).toBe("REDIRECT:/conta");
    expect(await resultado(() => loginAction({}, form({ email: "cli@exemplo.com", password: SENHA })))).toBe("REDIRECT:/conta");
  });

  it("administrador que veio da sacola volta para a sacola (o destino pedido vale)", async () => {
    await criarAdmin();
    expect(await resultado(() => loginAction({}, form({ email: "admin@exemplo.com", password: SENHA, next: "/carrinho" })))).toBe("REDIRECT:/carrinho");
  });

  it("administrador com senha provisória vai trocar a senha, não ao painel", async () => {
    const id = await criarAdmin();
    await (await getDb()).update(customers).set({ mustChangePassword: true }).where(eq(customers.id, id));
    expect(await resultado(() => loginAction({}, form({ email: "admin@exemplo.com", password: SENHA })))).toBe("REDIRECT:/conta?trocar=1");
  });
});

describe("a janela de 12 horas não pode ser renovada sem provar a senha", () => {
  it("'sair de todos os outros' mantém o horário do login original (não renova)", async () => {
    const id = await criarAdmin();
    await entrarComo(id, 13); // login de 13 horas atrás: o painel está fechado para ele
    const antes = (await currentSession())?.iat as number;
    await resultado(() => signOutEverywhereAction());
    const depois = (await currentSession())?.iat as number;
    expect(depois).toBe(antes);
    expect(await isAdmin()).toBe(false);
  });

  it("trocar a senha (que exige a senha atual) renova o horário do login", async () => {
    const id = await criarAdmin();
    await entrarComo(id, 11);
    const antes = (await currentSession())?.iat as number;
    const r = await changePasswordAction({}, form({ current: SENHA, next: "outra senha forte 456", confirm: "outra senha forte 456" }));
    expect(r.ok).toBeTruthy();
    expect(((await currentSession())?.iat as number) > antes).toBe(true);
  });
});

describe("conta de administrador", () => {
  // Excluir a conta anonimizaria o único administrador e deixaria a loja sem ninguém para administrá-la.
  it("não se exclui sozinha, mesmo com a senha certa", async () => {
    const id = await criarAdmin();
    await entrarComo(id);
    const r = await deleteAccountAction({}, form({ password: SENHA }));
    expect(r.error).toMatch(/administrador/i);
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect(c.anonymizedAt).toBeNull();
    expect(c.role).toBe("admin");
  });
});

describe("senha provisória fecha o resto do site", () => {
  it("requireCustomer leva a trocar a senha, e só a página da conta passa", async () => {
    const { requireCustomer } = await import("@/server/customers/session");
    const id = await clienteDeTeste("provisoria@exemplo.com");
    await (await getDb()).update(customers).set({ mustChangePassword: true }).where(eq(customers.id, id));
    await entrarComo(id);
    expect(await resultado(() => requireCustomer("/conta/pedidos"))).toBe("REDIRECT:/conta?trocar=1");
    expect(await resultado(() => requireCustomer("/conta", { permitirSenhaProvisoria: true }))).toBe("OK");
  });

  it("e a rota de compra também recusa (403) até a senha ser trocada", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const id = await clienteDeTeste("provisoria2@exemplo.com");
    await (await getDb()).update(customers).set({ mustChangePassword: true }).where(eq(customers.id, id));
    await entrarComo(id);
    const res = await POST(new Request("http://x/api/orders", { method: "POST", body: JSON.stringify({ items: [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }] }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/senha provisória/i);
  });
});

