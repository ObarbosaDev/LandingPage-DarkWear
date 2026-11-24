// ============================================================================
// Testes do PAINEL DE CUPONS (src/server/coupons.ts e as ações de src/app/admin/actions.ts): ler o formulário com
// rigor, criar sem duplicar, ligar/desligar, e deixar o rastro no diário.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createCouponAction, setCouponActiveAction } from "@/app/admin/actions";
import { listarAuditoria } from "@/server/admin/audit";
import { createCoupon, getCoupon, listCoupons, parseCouponForm, pixDescontoPercent, setCouponActive } from "@/server/coupons";
import { startCustomerSession } from "@/server/customers/session";
import { getDb } from "@/server/db";
import { adminAudit, coupons, customers, rateLimits } from "@/server/db/schema";
import { clienteDeTeste, resetDb } from "./helpers/db";

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

beforeEach(async () => {
  await resetDb();
  const db = await getDb();
  await db.delete(coupons);
  await db.delete(adminAudit);
  await db.delete(rateLimits);
  jar.clear();
  delete process.env.PIX_DISCOUNT_PERCENT;
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const valido = { code: "bemvindo10", kind: "percent", value: "10", min: "", maxUses: "", startsAt: "", expiresAt: "", active: "on" };
const parse = (o: Record<string, string> = {}) => parseCouponForm(form({ ...valido, ...o }));

async function entrarComoAdmin() {
  const id = await clienteDeTeste("admin@exemplo.com");
  await (await getDb()).update(customers).set({ role: "admin" }).where(eq(customers.id, id));
  await startCustomerSession(id, 1, Date.now(), "admin");
}
const tentar = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "OK";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

describe("parseCouponForm", () => {
  it("lê um cupom percentual válido", () => {
    expect(parse()).toEqual({ ok: true, data: { code: "BEMVINDO10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true } });
  });

  it("valor fixo em reais vira centavos (vírgula, ponto de milhar e centavos de um dígito)", () => {
    for (const [digitado, cents] of [["15", 1500], ["15,5", 1550], ["15,50", 1550], ["1.250,90", 125090], ["0,99", 99]] as const) {
      const r = parse({ kind: "fixed", value: digitado });
      expect(r.ok && r.data.value, digitado).toBe(cents);
    }
  });

  it("recusa percentual fora de 1 a 90, com vírgula ou com texto", () => {
    for (const ruim of ["0", "91", "100", "-5", "10,5", "dez", "", "1e1"]) expect(parse({ value: ruim }).ok, ruim).toBe(false);
    for (const bom of ["1", "90"]) expect(parse({ value: bom }).ok, bom).toBe(true);
  });

  it("recusa valor fixo zero, absurdo ou mal escrito", () => {
    for (const ruim of ["0", "0,00", "10001", "abc", "", "1,234", "-3", "R$ 15"]) expect(parse({ kind: "fixed", value: ruim }).ok, ruim).toBe(false);
  });

  it("recusa código inválido e tipo desconhecido", () => {
    for (const ruim of ["", "ab", "com espaço", "<b>", "ÁGUA"]) expect(parse({ code: ruim }).ok, ruim).toBe(false);
    expect(parse({ kind: "outro" }).ok).toBe(false);
  });

  it("pedido mínimo e limite de usos: opcionais, mas rígidos quando preenchidos", () => {
    expect(parse({ min: "150,00" })).toMatchObject({ ok: true, data: { minOrderCents: 15000 } });
    expect(parse({ maxUses: "50" })).toMatchObject({ ok: true, data: { maxUses: 50 } });
    for (const ruim of ["-1", "abc"]) expect(parse({ min: ruim }).ok, ruim).toBe(false);
    for (const ruim of ["0", "-3", "1,5", "abc", "99999999"]) expect(parse({ maxUses: ruim }).ok, ruim).toBe(false);
  });

  it("datas: começo e fim do dia no horário de Brasília; recusa data inexistente e fim antes do começo", () => {
    const r = parse({ startsAt: "2026-12-01", expiresAt: "2026-12-31" });
    expect(r.ok && r.data.startsAt?.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    // O cupom vale ATÉ O FIM do dia 31: vence no começo do dia 1º de janeiro (03:00 UTC = meia-noite em Brasília).
    expect(r.ok && r.data.expiresAt?.toISOString()).toBe("2027-01-01T03:00:00.000Z");
    for (const ruim of ["2026-02-31", "2026-13-01", "31/12/2026", "ontem"]) expect(parse({ expiresAt: ruim }).ok, ruim).toBe(false);
    expect(parse({ startsAt: "2026-12-31", expiresAt: "2026-12-01" }).ok).toBe(false);
    // Mesmo dia: o cupom vale aquele dia inteiro.
    expect(parse({ startsAt: "2026-12-05", expiresAt: "2026-12-05" }).ok).toBe(true);
  });

  it("'active' só vale marcado ('on')", () => {
    expect(parse({ active: "" })).toMatchObject({ data: { active: false } });
    expect(parse({ active: "true" })).toMatchObject({ data: { active: false } });
  });
});

describe("createCoupon, listCoupons e setCouponActive", () => {
  const novo = (code: string, active = true) => createCoupon({ code, kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active });

  it("cria e não duplica o mesmo código", async () => {
    expect(await novo("ABC10")).toBe("ok");
    expect(await novo("ABC10")).toBe("existe");
    expect(await listCoupons()).toHaveLength(1);
  });

  it("getCoupon normaliza o código e devolve null para o que não existe ou é inválido", async () => {
    await novo("ABC10");
    expect(await getCoupon(" abc10 ")).toMatchObject({ code: "ABC10", usedCount: 0 });
    expect(await getCoupon("NAO10")).toBeNull();
    expect(await getCoupon("<x>")).toBeNull();
  });

  it("lista os ativos primeiro", async () => {
    await novo("INATIVO", false);
    await novo("ATIVO1", true);
    expect((await listCoupons()).map((c) => c.code)).toEqual(["ATIVO1", "INATIVO"]);
  });

  it("liga e desliga; cupom inexistente ou código inválido retorna false", async () => {
    await novo("ABC10");
    expect(await setCouponActive("abc10", false)).toBe(true);
    expect((await getCoupon("ABC10"))?.active).toBe(false);
    expect(await setCouponActive("ABC10", true)).toBe(true);
    expect(await setCouponActive("NAO10", true)).toBe(false);
    expect(await setCouponActive("<x>", true)).toBe(false);
  });
});

describe("ações do painel", () => {
  it("criar: grava, anota no diário e volta à lista", async () => {
    await entrarComoAdmin();
    expect(await tentar(() => createCouponAction({}, form(valido)))).toBe("REDIRECT:/admin/cupons?criado=1");
    expect(await getCoupon("BEMVINDO10")).toMatchObject({ kind: "percent", value: 10, active: true });
    expect((await listarAuditoria())[0]).toMatchObject({ ator: "admin@exemplo.com", acao: "cupom.criar", alvo: "BEMVINDO10", detalhe: "10%" });
  });

  it("criar com erro devolve a mensagem e o que foi digitado; código repetido também", async () => {
    await entrarComoAdmin();
    const ruim = await createCouponAction({}, form({ ...valido, value: "500" }));
    expect(ruim.error).toMatch(/Percentual inválido/);
    expect(ruim.values?.code).toBe("bemvindo10");
    await createCouponAction({}, form(valido)).catch(() => {});
    expect((await createCouponAction({}, form(valido))).error).toMatch(/Já existe/);
    expect(await listCoupons()).toHaveLength(1);
  });

  it("ativar/desativar anota no diário só quando mudou algo", async () => {
    await entrarComoAdmin();
    await createCouponAction({}, form(valido)).catch(() => {});
    await setCouponActiveAction(form({ code: "BEMVINDO10", active: "false" }));
    await setCouponActiveAction(form({ code: "NAOEXISTE", active: "false" }));
    const acoes = (await listarAuditoria()).filter((e) => e.acao === "cupom.visibilidade");
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ alvo: "BEMVINDO10", detalhe: "desativado" });
    expect((await getCoupon("BEMVINDO10"))?.active).toBe(false);
  });
});

describe("pixDescontoPercent (configuração do dono)", () => {
  it.each([
    [undefined, 0],
    ["", 0],
    ["0", 0],
    ["5", 5],
    [" 5 ", 5],
    ["30", 30],
    ["31", 30],
    ["999", 30],
    ["1000", 0],
    ["-5", 0],
    ["2.5", 0],
    ["abc", 0],
  ])("PIX_DISCOUNT_PERCENT=%j → %i", (env, esperado) => {
    if (env === undefined) delete process.env.PIX_DISCOUNT_PERCENT;
    else process.env.PIX_DISCOUNT_PERCENT = env;
    expect(pixDescontoPercent()).toBe(esperado);
  });
});
