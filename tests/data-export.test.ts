// ============================================================================
// Testes de "BAIXAR MEUS DADOS" (LGPD): src/server/customers/export.ts e GET /api/conta/dados.
// O que mais importa provar: o arquivo traz o que é DA pessoa e nada além. Nunca a senha, o segundo fator, o
// segredo da sessão nem dados de outro cliente; e só quem está logado baixa, com limite de uso.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/conta/dados/route";
import { updateOrderStatus } from "@/server/admin/orders";
import { exportCustomerData } from "@/server/customers/export";
import { saveAddress } from "@/server/customers/address";
import { anonymizeCustomer } from "@/server/customers";
import { startCustomerSession } from "@/server/customers/session";
import { createCoupon } from "@/server/coupons";
import { getDb } from "@/server/db";
import { coupons, customers, payments, rateLimits } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { clienteDeTeste, resetDb } from "./helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "10.0.0.1" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (o: { name: string }) => void jar.delete(o.name),
  }),
}));

const itens = [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 2 }];
const endereco = { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: "Apto 5", district: "Bela Vista", city: "São Paulo", state: "SP" };

beforeEach(async () => {
  await resetDb();
  const db = await getDb();
  await db.delete(coupons);
  await db.delete(rateLimits);
  jar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Uma cliente com endereço, um pedido com cupom, já enviado com rastreio, e um pagamento. */
async function clienteCompleta() {
  const id = await clienteDeTeste("ana@exemplo.com");
  await saveAddress(id, endereco);
  await createCoupon({ code: "BEMVINDO10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true });
  const p = await createOrder(itens, id, endereco, { coupon: "BEMVINDO10" });
  await updateOrderStatus(p.id, "pago", { actor: "adm@loja.com" });
  await updateOrderStatus(p.id, "enviado", { tracking: "AB123456789BR", actor: "adm@loja.com" });
  await (await getDb()).insert(payments).values({ orderId: p.id, provider: "mercadopago", providerPaymentId: "pay-1", preferenceId: "pref-secreta", status: "aprovado", method: "bank_transfer", amountCents: p.totalCents, paidAt: new Date() });
  return { id, pedido: p };
}

describe("exportCustomerData", () => {
  it("traz a conta, o endereço e cada pedido com itens, descontos, rastreio, entrega e histórico", async () => {
    const { id, pedido } = await clienteCompleta();
    const d = (await exportCustomerData(id))!;
    expect(d.conta).toMatchObject({ nome: "Cliente de Teste", email: "ana@exemplo.com" });
    expect(d.conta.aceitouAPoliticaDePrivacidadeEm).toEqual(expect.any(String));
    expect(d.endereco).toMatchObject({ cep: "01310100", rua: "Avenida Paulista", numero: "1000", complemento: "Apto 5", bairro: "Bela Vista", cidade: "São Paulo", estado: "SP" });
    expect(d.pedidos).toHaveLength(1);
    const p = d.pedidos[0];
    expect(p).toMatchObject({ numero: pedido.number, situacao: "enviado", totalEmCentavos: pedido.totalCents, rastreio: "AB123456789BR" });
    expect(p.descontos).toMatchObject({ cupom: "BEMVINDO10", cupomEmCentavos: pedido.couponDiscountCents, pixEmCentavos: 0 });
    expect(p.itens).toEqual([{ nome: pedido.items[0].name, tamanho: "M", cor: "Preta", quantidade: 2, precoUnitarioEmCentavos: 8990 }]);
    expect(p.entregaEm).toMatchObject({ cep: "01310100", cidade: "São Paulo" });
    expect(p.andamento.map((h) => h.para)).toEqual(["pendente", "pago", "enviado"]);
    expect(p.pagamentos).toEqual([{ situacao: "aprovado", forma: "bank_transfer", parcelas: null, valorEmCentavos: pedido.totalCents, pagoEm: expect.any(String) }]);
  });

  it("NUNCA inclui senha, segundo fator, versão de sessão, papel, quem mexeu no pedido nem chaves do pagamento", async () => {
    const { id } = await clienteCompleta();
    await (await getDb()).update(customers).set({ totpSecret: "v1.aaaa.bbbb.cccc" }).where(eq(customers.id, id));
    const texto = JSON.stringify(await exportCustomerData(id));
    for (const proibido of ["passwordHash", "password_hash", "scrypt", "totp", "v1.aaaa", "sessionVersion", "adm@loja.com", "pref-secreta", "pay-1", "preferenceId", "providerPaymentId"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect(texto).not.toContain(c.passwordHash);
  });

  it("só os pedidos DA pessoa: o de outro cliente nunca aparece", async () => {
    const { id } = await clienteCompleta();
    const outra = await clienteDeTeste("outra@exemplo.com");
    const alheio = await createOrder(itens, outra);
    const d = (await exportCustomerData(id))!;
    expect(d.pedidos.map((p) => p.numero)).not.toContain(alheio.number);
    expect(JSON.stringify(d)).not.toContain("outra@exemplo.com");
  });

  it("conta sem endereço e sem pedidos: campos vazios, sem quebrar", async () => {
    const id = await clienteDeTeste("nova@exemplo.com");
    const d = (await exportCustomerData(id))!;
    expect(d.endereco).toBeNull();
    expect(d.pedidos).toEqual([]);
  });

  it("conta excluída (anonimizada), inexistente ou id inválido: nada para baixar", async () => {
    const id = await clienteDeTeste("saiu@exemplo.com");
    await anonymizeCustomer(id);
    expect(await exportCustomerData(id)).toBeNull();
    for (const ruim of [999999, 0, -1, 1.5, Number.NaN]) expect(await exportCustomerData(ruim), String(ruim)).toBeNull();
  });
});

describe("GET /api/conta/dados", () => {
  it("sem conta: 401", async () => {
    expect((await GET()).status).toBe(401);
  });

  it("logado: baixa um JSON como anexo, sem cache, com os dados da pessoa", async () => {
    const { id } = await clienteCompleta();
    await startCustomerSession(id, 1);
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="meus-dados-darkwear-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const j = JSON.parse(await r.text());
    expect(j.conta.email).toBe("ana@exemplo.com");
    expect(j.geradoEm).toEqual(expect.any(String));
  });

  it("limite: 5 downloads por hora por conta", async () => {
    const id = await clienteDeTeste();
    await startCustomerSession(id, 1);
    for (let i = 0; i < 5; i++) expect((await GET()).status).toBe(200);
    const r = await GET();
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });

  it("senha provisória: tem de trocar antes (como no resto da conta)", async () => {
    const id = await clienteDeTeste();
    await (await getDb()).update(customers).set({ mustChangePassword: true }).where(eq(customers.id, id));
    await startCustomerSession(id, 1);
    expect((await GET()).status).toBe(403);
  });
});
