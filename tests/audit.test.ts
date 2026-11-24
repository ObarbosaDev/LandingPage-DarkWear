// ============================================================================
// Testes do DIÁRIO DO PAINEL (src/server/admin/audit.ts): cada ação do administrador deixa registrado quem fez,
// o quê e quando; quem não é administrador não deixa (nem consegue agir); e uma falha do diário nunca atrapalha
// a ação do dono.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { adminAudit, customers, orderStatusHistory, rateLimits } from "@/server/db/schema";
import { startCustomerSession } from "@/server/customers/session";
import { hashPassword } from "@/server/customers/password";
import { auditar, listarAuditoria } from "@/server/admin/audit";
import { listOrders } from "@/server/admin/orders";
import { getCustomerOrder } from "@/server/customers/orders";
import { createOrder } from "@/server/orders";
import {
  changeCustomStatusAction,
  changeOrderStatusAction,
  resetCustomerPasswordAction,
  setActiveAction,
  setStockAction,
  setTrackingAction,
} from "@/app/admin/actions";
import { clienteDeTeste, resetDb } from "./helpers/db";

// ---------- o "navegador" de mentira (igual ao de admin-access.test.ts) ----------
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
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const SENHA = "minha senha forte 123";
const EMAIL_ADMIN = "ana.admin@exemplo.com";

beforeEach(async () => {
  await resetDb();
  const db = await getDb();
  await db.delete(rateLimits);
  await db.delete(adminAudit);
  jar.clear();
});

async function entrarComoAdmin(email = EMAIL_ADMIN): Promise<number> {
  const id = await clienteDeTeste(email);
  await (await getDb()).update(customers).set({ role: "admin", passwordHash: await hashPassword(SENHA) }).where(eq(customers.id, id));
  await startCustomerSession(id, 1, Date.now(), "admin");
  return id;
}

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const tentar = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "OK";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const item = [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }];

describe("o diário registra as ações do administrador", () => {
  it("mudar o status do pedido grava quem fez, no diário e no histórico do pedido", async () => {
    await entrarComoAdmin();
    const p = await createOrder(item, await clienteDeTeste("cliente@exemplo.com"));
    await changeOrderStatusAction(form({ id: String(p.id), next: "pago" }));

    const [e] = await listarAuditoria();
    expect(e).toMatchObject({ ator: EMAIL_ADMIN, acao: "pedido.status", alvo: p.number, detalhe: "→ pago" });
    expect(e.em).toBeInstanceOf(Date);
    const hist = (await listOrders()).find((o) => o.id === p.id)!.history;
    expect(hist.at(-1)).toMatchObject({ toStatus: "pago", origin: "painel", actor: EMAIL_ADMIN });
    // O primeiro registro (o pedido nasceu) não veio do painel: sem autor.
    expect(hist[0].actor).toBeNull();
  });

  it("cancelar pelo painel também grava o autor no histórico", async () => {
    await entrarComoAdmin();
    const p = await createOrder(item, await clienteDeTeste("cliente@exemplo.com"));
    await changeOrderStatusAction(form({ id: String(p.id), next: "cancelado" }));
    const hist = (await listOrders()).find((o) => o.id === p.id)!.history;
    expect(hist.at(-1)).toMatchObject({ toStatus: "cancelado", actor: EMAIL_ADMIN });
  });

  it("rastreio, estoque, visibilidade, encomenda e senha provisória também entram", async () => {
    await entrarComoAdmin();
    const dono = await clienteDeTeste("cliente@exemplo.com");
    const p = await createOrder(item, dono);
    await changeOrderStatusAction(form({ id: String(p.id), next: "pago" }));
    await changeOrderStatusAction(form({ id: String(p.id), next: "enviado" }));
    await setTrackingAction(form({ id: String(p.id), tracking: "AB123456789BR" }));
    await setStockAction(form({ slug: "oversized-gt3-rs", "estoque:M|Preta": "7" }));
    await setActiveAction(form({ slug: "camisa-mumia", active: "false" }));
    await resetCustomerPasswordAction({}, form({ id: String(dono), nome: "Cliente" }));
    const acoes = (await listarAuditoria()).map((e) => e.acao);
    expect(acoes).toEqual(expect.arrayContaining(["pedido.status", "pedido.rastreio", "produto.estoque", "produto.visibilidade", "cliente.senha-provisoria"]));
    const estoque = (await listarAuditoria()).find((e) => e.acao === "produto.estoque");
    expect(estoque).toMatchObject({ alvo: "oversized-gt3-rs", detalhe: "M|Preta=7" });
  });

  it("ação recusada ou sem efeito NÃO entra no diário", async () => {
    await entrarComoAdmin();
    await setStockAction(form({ slug: "oversized-gt3-rs", "estoque:M|Preta": "-3" })); // inválido
    await setStockAction(form({ slug: "nao-existe", "estoque:M|Preta": "3" }));
    await changeOrderStatusAction(form({ id: "999999", next: "pago" })).catch(() => {});
    expect(await listarAuditoria()).toEqual([]);
  });

  it("quem não é administrador não age e não deixa rastro", async () => {
    const id = await clienteDeTeste("comum@exemplo.com");
    await startCustomerSession(id, 1, Date.now(), "cliente");
    expect(await tentar(() => setActiveAction(form({ slug: "camisa-mumia", active: "false" })))).toBe("NOT_FOUND");
    expect(await tentar(() => changeCustomStatusAction(form({ id: "1", status: "novo" })))).toBe("NOT_FOUND");
    expect(await listarAuditoria()).toEqual([]);
  });
});

describe("auditar e listarAuditoria", () => {
  it("lista da mais nova para a mais antiga e respeita o limite", async () => {
    for (let i = 1; i <= 5; i++) await auditar("ana@exemplo.com", "pedido.status", `DW-0000${i}`, "→ pago");
    const todas = await listarAuditoria();
    expect(todas.map((e) => e.alvo)).toEqual(["DW-00005", "DW-00004", "DW-00003", "DW-00002", "DW-00001"]);
    expect(await listarAuditoria(2)).toHaveLength(2);
    // Limite absurdo ou inválido não derruba a consulta.
    expect((await listarAuditoria(0)).length).toBe(1);
    expect((await listarAuditoria(Number.NaN)).length).toBe(5);
    expect((await listarAuditoria(10_000)).length).toBe(5);
  });

  it("falha do diário nunca lança (a ação do dono já valeu)", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    // E-mail de 1 letra viola a regra do banco: o registro falha, mas auditar não lança.
    await expect(auditar("x", "pedido.status", "DW-00001")).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
    expect(await listarAuditoria()).toEqual([]);
  });

  it("textos longos são cortados em vez de recusados", async () => {
    await auditar("ana@exemplo.com", "produto.estoque", "a".repeat(500), "b".repeat(900));
    const [e] = await listarAuditoria();
    expect(e.alvo).toHaveLength(120);
    expect(e.detalhe).toHaveLength(300);
  });

  it("o banco recusa código de ação fora do padrão", async () => {
    const db = await getDb();
    await expect(db.insert(adminAudit).values({ actorEmail: "ana@exemplo.com", action: "QUALQUER COISA" })).rejects.toThrow();
  });
});

describe("o cliente nunca vê quem mexeu no pedido", () => {
  it("a página do pedido do cliente não traz o autor das mudanças", async () => {
    await entrarComoAdmin();
    const cliente = await clienteDeTeste("cliente@exemplo.com");
    const p = await createOrder(item, cliente);
    await changeOrderStatusAction(form({ id: String(p.id), next: "pago" }));
    const detalhe = await getCustomerOrder(cliente, p.number);
    expect(JSON.stringify(detalhe)).not.toContain(EMAIL_ADMIN);
    expect(Object.keys(detalhe!.history[0])).toEqual(["fromStatus", "toStatus", "at"]);
    // E o histórico do banco tem o autor (só o painel o lê).
    const [h] = await (await getDb()).select().from(orderStatusHistory).where(eq(orderStatusHistory.toStatus, "pago"));
    expect(h.actor).toBe(EMAIL_ADMIN);
  });
});
