// ============================================================================
// Testes de "MEUS PEDIDOS" (src/server/customers/orders.ts): cada cliente só vê os próprios pedidos.
// Por que testar: é a fronteira de privacidade da loja. Um erro aqui mostraria o pedido, o valor e o
// histórico de pagamento de uma pessoa para outra. Por isso o teste mais importante é o de "pedido de
// outro cliente": ele tem de ser indistinguível de "pedido que não existe".
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orders, payments } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { getCustomerOrder, listCustomerOrders } from "@/server/customers/orders";
import { clienteDeTeste, resetDb } from "./helpers/db";

beforeEach(resetDb);

const item = (qty = 1) => [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty }];

describe("listCustomerOrders", () => {
  it("devolve só os pedidos do cliente, do mais novo para o mais antigo, com a contagem de peças", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia@exemplo.com");
    const p1 = await createOrder(item(1), ana);
    const p2 = await createOrder(item(2), ana);
    await createOrder(item(1), bia);

    const lista = await listCustomerOrders(ana);
    expect(lista.map((o) => o.number)).toEqual([p2.number, p1.number]);
    expect(lista[0]).toMatchObject({ status: "pendente", totalCents: 2 * 8990, itemCount: 2 });
    expect(lista[1]).toMatchObject({ totalCents: 8990, itemCount: 1 });
    expect(await listCustomerOrders(bia)).toHaveLength(1);
  });

  it("cliente sem pedidos, inexistente ou com id inválido recebe lista vazia", async () => {
    const ana = await clienteDeTeste();
    expect(await listCustomerOrders(ana)).toEqual([]);
    for (const id of [999999, 0, -1, 1.5, NaN]) expect(await listCustomerOrders(id), String(id)).toEqual([]);
  });

  it("pedidos antigos, sem dono, nunca aparecem para ninguém", async () => {
    const ana = await clienteDeTeste();
    await createOrder(item(1), ana);
    const db = await getDb();
    await db.update(orders).set({ customerId: null });
    expect(await listCustomerOrders(ana)).toEqual([]);
  });
});

describe("getCustomerOrder", () => {
  it("devolve o detalhe do próprio pedido: itens, valores, histórico e pagamento", async () => {
    const ana = await clienteDeTeste();
    const p = await createOrder(item(2), ana);
    const db = await getDb();
    await db.insert(payments).values({ orderId: p.id, provider: "mercadopago", providerPaymentId: "1", status: "aprovado", method: "credit_card", installments: 3, amountCents: 2 * 8990 });

    const d = await getCustomerOrder(ana, p.number);
    expect(d).toMatchObject({ number: p.number, status: "pendente", totalCents: 2 * 8990 });
    expect(d?.items).toEqual([{ name: p.items[0].name, size: "M", color: "Preta", qty: 2, unitPriceCents: 8990 }]);
    expect(d?.history).toMatchObject([{ fromStatus: null, toStatus: "pendente" }]);
    expect(d?.payments).toMatchObject([{ status: "aprovado", method: "credit_card", installments: 3, amountCents: 2 * 8990 }]);
  });

  // O teste mais importante: o pedido de OUTRO cliente é indistinguível de um pedido que não existe.
  it("pedido de outro cliente devolve null, exatamente como um número que não existe", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia@exemplo.com");
    const deAna = await createOrder(item(1), ana);
    expect(await getCustomerOrder(bia, deAna.number)).toBeNull();
    expect(await getCustomerOrder(bia, "DW-99999")).toBeNull();
    expect(await getCustomerOrder(ana, deAna.number)).not.toBeNull();
  });

  it("pedido antigo sem dono nunca é entregue a ninguém", async () => {
    const ana = await clienteDeTeste();
    const p = await createOrder(item(1), ana);
    await (await getDb()).update(orders).set({ customerId: null }).where(eq(orders.id, p.id));
    expect(await getCustomerOrder(ana, p.number)).toBeNull();
  });

  it.each(["", "DW-1", "DW-0000X", "dw-00001", "1", "DW-00001' OR 1=1 --", "DW-00001; DROP TABLE orders", " DW-00001", "DW-00001 ", "DW--0001", "DW-99999999999", "../DW-00001", "DW-00001\n"])(
    "número inválido %j devolve null",
    async (numero) => {
      const ana = await clienteDeTeste();
      await createOrder(item(1), ana);
      expect(await getCustomerOrder(ana, numero)).toBeNull();
    },
  );

  it("tipos que não são texto ou id inválido devolvem null", async () => {
    const ana = await clienteDeTeste();
    const p = await createOrder(item(1), ana);
    for (const n of [undefined, null, 1, {}, ["DW-00001"]]) expect(await getCustomerOrder(ana, n as unknown as string)).toBeNull();
    for (const id of [0, -1, 1.5, NaN, 999999]) expect(await getCustomerOrder(id, p.number), String(id)).toBeNull();
  });

  it("não devolve dados internos (origem do status, chaves do pagamento)", async () => {
    const ana = await clienteDeTeste();
    const p = await createOrder(item(1), ana);
    await (await getDb()).insert(payments).values({ orderId: p.id, provider: "mercadopago", providerPaymentId: "777", preferenceId: "pref-secreta", status: "aprovado", amountCents: 8990 });
    const texto = JSON.stringify(await getCustomerOrder(ana, p.number));
    expect(texto).not.toMatch(/777|pref-secreta|origin|provider|customer/i);
  });
});
