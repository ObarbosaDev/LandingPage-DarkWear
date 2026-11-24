// ============================================================================
// Testes do PAGAMENTO no painel do dono: a lista de pedidos traz os pagamentos online, o alerta de
// "cliente pagou mas o pedido não ficou pago" e os rótulos legíveis (forma e parcelas).
// Por que testar: o alerta é a única forma de o dono descobrir que um cliente pagou e não vai
// receber. Se ele falhar em silêncio, é dinheiro de cliente parado.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orders, payments } from "@/server/db/schema";
import { alertaDePagamento, listOrders } from "@/server/admin/orders";
import { createOrder } from "@/server/orders";
import { installmentsLabel, methodLabel } from "@/lib/payment-labels";
import { clienteDeTeste, resetDb } from "./helpers/db";

const itens = [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }];
const pag = (o: Partial<Parameters<typeof alertaDePagamento>[2][number]> = {}) => ({
  status: "aprovado" as const,
  method: "credit_card",
  installments: 1,
  amountCents: 8990,
  paidAt: new Date(),
  createdAt: new Date(),
  ...o,
});

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(payments);
});

describe("alertaDePagamento", () => {
  it("sem pagamento aprovado, nunca há alerta", () => {
    expect(alertaDePagamento("pendente", 8990, [])).toBeNull();
    for (const status of ["iniciado", "pendente", "recusado", "cancelado", "estornado"] as const) {
      expect(alertaDePagamento("cancelado", 8990, [pag({ status })]), status).toBeNull();
    }
  });

  it("pagamento aprovado em pedido cancelado: alerta 'cancelado'", () => {
    expect(alertaDePagamento("cancelado", 8990, [pag()])).toBe("cancelado");
  });

  it("pedido ainda pendente com aprovado de valor diferente: alerta 'valor'", () => {
    expect(alertaDePagamento("pendente", 8990, [pag({ amountCents: 100 })])).toBe("valor");
    expect(alertaDePagamento("pendente", 8990, [pag({ amountCents: null })])).toBe("valor");
  });

  it("pedido pago, enviado ou entregue com pagamento aprovado: tudo certo", () => {
    for (const s of ["pago", "enviado", "entregue"] as const) expect(alertaDePagamento(s, 8990, [pag()]), s).toBeNull();
  });

  it("pedido pendente com aprovado do valor exato não alerta (o aviso ainda vai marcar como pago)", () => {
    expect(alertaDePagamento("pendente", 8990, [pag()])).toBeNull();
  });
});

describe("listOrders com pagamentos", () => {
  it("traz os pagamentos de cada pedido, e pedido sem pagamento online vem com lista vazia", async () => {
    const a = await createOrder(itens, await clienteDeTeste());
    const b = await createOrder(itens, await clienteDeTeste());
    const db = await getDb();
    await db.insert(payments).values({ orderId: a.id, provider: "mercadopago", providerPaymentId: "1", status: "aprovado", method: "debit_card", installments: 1, amountCents: 8990 });
    await db.update(orders).set({ status: "pago" }).where(eq(orders.id, a.id));

    const lista = await listOrders();
    const pa = lista.find((o) => o.id === a.id)!;
    const pb = lista.find((o) => o.id === b.id)!;
    expect(pa.payments).toHaveLength(1);
    expect(pa.payments[0]).toMatchObject({ status: "aprovado", method: "debit_card", amountCents: 8990 });
    expect(pa.alerta).toBeNull();
    expect(pb.payments).toEqual([]);
    expect(pb.alerta).toBeNull();
  });

  it("o alerta aparece para quem pagou depois de o pedido ser cancelado", async () => {
    const o = await createOrder(itens, await clienteDeTeste());
    const db = await getDb();
    await db.update(orders).set({ status: "cancelado" }).where(eq(orders.id, o.id));
    await db.insert(payments).values({ orderId: o.id, provider: "mercadopago", providerPaymentId: "2", status: "aprovado", amountCents: 8990 });
    expect((await listOrders()).find((x) => x.id === o.id)?.alerta).toBe("cancelado");
  });
});

describe("rótulos do pagamento", () => {
  it.each([
    ["credit_card", "cartão de crédito"],
    ["debit_card", "cartão de débito"],
    ["prepaid_card", "cartão pré-pago"],
    ["bank_transfer", "Pix"],
    ["account_money", "saldo Mercado Pago"],
    ["ticket", "boleto"],
    [null, "forma não informada"],
    ["algo_novo", "algo_novo"],
  ])("%s → %s", (codigo, texto) => {
    expect(methodLabel(codigo)).toBe(texto);
  });

  it("parcelas só aparecem para cartão de crédito", () => {
    expect(installmentsLabel("credit_card", 1)).toBe("à vista");
    expect(installmentsLabel("credit_card", 3)).toBe("3x");
    expect(installmentsLabel("debit_card", 1)).toBeNull();
    expect(installmentsLabel("bank_transfer", 1)).toBeNull();
    expect(installmentsLabel("credit_card", null)).toBeNull();
    expect(installmentsLabel("credit_card", 0)).toBeNull();
  });
});
