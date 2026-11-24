// ============================================================================
// Testes do ENDEREÇO NO PEDIDO: comprar exige endereço, o pedido guarda uma CÓPIA dele, e excluir a conta apaga o
// endereço (da conta e dos pedidos já encerrados).
// Por que testar: o pedido tem de sair para onde o cliente mandou NA HORA da compra (mudar o endereço da conta
// depois não pode desviar um pedido já feito) e o cliente nunca pode escolher o endereço de outro. E o endereço é
// dado pessoal: some com a conta, menos nos pedidos que ainda estão sendo entregues.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orders, products, rateLimits } from "@/server/db/schema";
import { POST } from "@/app/api/orders/route";
import { anonymizeCustomer } from "@/server/customers";
import { saveAddress, type Address } from "@/server/customers/address";
import { startCustomerSession } from "@/server/customers/session";
import { createOrder } from "@/server/orders";
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
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const ENDERECO: Address = { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: "Sala 12", district: "Bela Vista", city: "São Paulo", state: "SP" };
const OUTRO: Address = { zip: "20040020", street: "Rua da Assembleia", number: "10", complement: null, district: "Centro", city: "Rio de Janeiro", state: "RJ" };
const itens = [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }];

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(rateLimits);
  jar.clear();
});
afterEach(() => vi.unstubAllGlobals());

const pedir = (corpo: Record<string, unknown> = {}) => POST(new Request("http://x/api/orders", { method: "POST", body: JSON.stringify({ items: itens, ...corpo }) }));
const pedidoNoBanco = async (id: number) => (await (await getDb()).select().from(orders).where(eq(orders.id, id)))[0];
const estoque = async () => (await (await getDb()).select({ s: products.stock }).from(products).where(eq(products.slug, "oversized-gt3-rs")))[0].s;
const copia = (o: Awaited<ReturnType<typeof pedidoNoBanco>>) => [o.shipZip, o.shipStreet, o.shipNumber, o.shipComplement, o.shipDistrict, o.shipCity, o.shipState];

describe("POST /api/orders exige endereço", () => {
  it("sem endereço cadastrado: 422 com code 'sem-endereco', sem criar pedido e SEM baixar estoque", async () => {
    const id = await clienteDeTeste();
    await startCustomerSession(id, 1);
    const antes = await estoque();
    const res = await pedir();
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.code).toBe("sem-endereco");
    expect(corpo.error).toMatch(/endereço/i);
    expect(await estoque()).toBe(antes);
    expect(await (await getDb()).select().from(orders)).toHaveLength(0);
  });

  it("com endereço: o pedido guarda uma cópia dele", async () => {
    const id = await clienteDeTeste();
    await saveAddress(id, ENDERECO);
    await startCustomerSession(id, 1);
    expect((await pedir()).status).toBe(201);
    const [o] = await (await getDb()).select().from(orders);
    expect(copia(o)).toEqual(["01310100", "Avenida Paulista", "1000", "Sala 12", "Bela Vista", "São Paulo", "SP"]);
  });

  // O endereço do pedido vem SÓ da conta de quem está logado: nada no corpo da requisição o escolhe.
  it("ignora qualquer endereço enviado no corpo da requisição", async () => {
    const id = await clienteDeTeste();
    await saveAddress(id, ENDERECO);
    await startCustomerSession(id, 1);
    await pedir({ address: OUTRO, endereco: OUTRO, ship_zip: "99999999", shipZip: "99999999", zip: "99999999" });
    const [o] = await (await getDb()).select().from(orders);
    expect(o.shipZip).toBe("01310100");
  });

  it("mudar o endereço da conta DEPOIS não muda o pedido já feito, e o pedido seguinte usa o novo", async () => {
    const id = await clienteDeTeste();
    await saveAddress(id, ENDERECO);
    await startCustomerSession(id, 1);
    await pedir();
    await saveAddress(id, OUTRO);
    await pedir();
    const lista = (await (await getDb()).select().from(orders)).sort((a, b) => a.id - b.id);
    expect(lista[0].shipCity).toBe("São Paulo");
    expect(lista[1].shipCity).toBe("Rio de Janeiro");
  });

  it("o endereço de um cliente nunca vai parar no pedido de outro", async () => {
    const a = await clienteDeTeste("a@exemplo.com");
    const b = await clienteDeTeste("b@exemplo.com");
    await saveAddress(a, ENDERECO);
    await saveAddress(b, OUTRO);
    await startCustomerSession(b, 1);
    await pedir();
    const [o] = await (await getDb()).select().from(orders);
    expect(o.customerId).toBe(b);
    expect(o.shipCity).toBe("Rio de Janeiro");
  });
});

describe("createOrder e a cópia do endereço", () => {
  it("sem endereço informado, o pedido fica sem cópia (testes e pedidos antigos)", async () => {
    const id = await clienteDeTeste();
    const p = await createOrder(itens, id);
    expect(copia(await pedidoNoBanco(p.id))).toEqual([null, null, null, null, null, null, null]);
  });

  it("com endereço, grava os sete campos", async () => {
    const id = await clienteDeTeste();
    const p = await createOrder(itens, id, ENDERECO);
    expect(copia(await pedidoNoBanco(p.id))).toEqual(["01310100", "Avenida Paulista", "1000", "Sala 12", "Bela Vista", "São Paulo", "SP"]);
  });
});

describe("excluir a conta e o endereço", () => {
  async function pedidosEm(id: number) {
    const db = await getDb();
    const ids: Record<string, number> = {};
    for (const status of ["pendente", "pago", "enviado", "entregue", "cancelado"] as const) {
      const p = await createOrder(itens, id, ENDERECO);
      await db.update(orders).set({ status }).where(eq(orders.id, p.id));
      ids[status] = p.id;
    }
    return ids;
  }

  it("apaga o endereço da conta e a cópia dos pedidos ENTREGUES e CANCELADOS; os pedidos em andamento mantêm a cópia", async () => {
    const id = await clienteDeTeste();
    await saveAddress(id, ENDERECO);
    const ids = await pedidosEm(id);
    await anonymizeCustomer(id);

    for (const s of ["entregue", "cancelado"]) expect(copia(await pedidoNoBanco(ids[s])), s).toEqual([null, null, null, null, null, null, null]);
    for (const s of ["pendente", "pago", "enviado"]) expect(await pedidoNoBanco(ids[s]).then((o) => o.shipStreet), s).toBe("Avenida Paulista");
  });

  it("não mexe nos pedidos de outros clientes", async () => {
    const a = await clienteDeTeste("a@exemplo.com");
    const b = await clienteDeTeste("b@exemplo.com");
    const pb = await createOrder(itens, b, OUTRO);
    await (await getDb()).update(orders).set({ status: "entregue" }).where(eq(orders.id, pb.id));
    await anonymizeCustomer(a);
    expect((await pedidoNoBanco(pb.id)).shipCity).toBe("Rio de Janeiro");
  });
});
