// ============================================================================
// Testes do CÓDIGO DE RASTREIO: a limpeza do texto digitado, o link, a regra do banco e o fluxo do painel
// (marcar como enviado com código, corrigir o código depois) e o que o cliente enxerga.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { linkDeRastreio, normalizarRastreio } from "@/lib/tracking";
import { listOrders, setTrackingCode, updateOrderStatus } from "@/server/admin/orders";
import { getCustomerOrder } from "@/server/customers/orders";
import { getDb } from "@/server/db";
import { orders } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { clienteDeTeste, resetDb } from "./helpers/db";

beforeEach(resetDb);

const item = [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }];
async function pedidoPago(cliente: number) {
  const p = await createOrder(item, cliente);
  await updateOrderStatus(p.id, "pago");
  return p;
}
const codigoNoBanco = async (id: number) => (await (await getDb()).select({ t: orders.trackingCode }).from(orders).where(eq(orders.id, id)))[0].t;

describe("normalizarRastreio / linkDeRastreio", () => {
  it("limpa espaços, pontos e hífens e põe em maiúsculas", () => {
    expect(normalizarRastreio(" ab 123.456-789 br ")).toBe("AB123456789BR");
  });
  it("recusa texto curto, longo ou com símbolos", () => {
    for (const ruim of ["", "ABC", "x".repeat(41), "AB12345<script>", "AB123456789BR?x=1", "ÁB123456789BR"]) {
      expect(normalizarRastreio(ruim), ruim).toBeNull();
    }
  });
  it("só códigos no formato dos Correios ganham link", () => {
    expect(linkDeRastreio("AB123456789BR")).toBe("https://rastreamento.correios.com.br/app/index.php?objetos=AB123456789BR");
    expect(linkDeRastreio("JADLOG12345678")).toBeNull();
  });
});

describe("marcar como enviado com código", () => {
  it("grava o código normalizado e o painel e o cliente o enxergam", async () => {
    const cliente = await clienteDeTeste();
    const p = await pedidoPago(cliente);
    expect(await updateOrderStatus(p.id, "enviado", { tracking: "ab 123456789 br" })).toBe("ok");
    expect(await codigoNoBanco(p.id)).toBe("AB123456789BR");
    expect((await listOrders()).find((o) => o.id === p.id)?.trackingCode).toBe("AB123456789BR");
    expect((await getCustomerOrder(cliente, p.number))?.trackingCode).toBe("AB123456789BR");
  });

  it("o código é opcional: enviar sem ele funciona", async () => {
    const p = await pedidoPago(await clienteDeTeste());
    expect(await updateOrderStatus(p.id, "enviado")).toBe("ok");
    expect(await updateOrderStatus(p.id, "entregue", { tracking: "" })).toBe("ok");
    expect(await codigoNoBanco(p.id)).toBeNull();
  });

  it("código inválido recusa tudo: o pedido NÃO muda de status", async () => {
    const p = await pedidoPago(await clienteDeTeste());
    expect(await updateOrderStatus(p.id, "enviado", { tracking: "<b>oi</b>" })).toBe("rastreio-invalido");
    expect((await listOrders()).find((o) => o.id === p.id)?.status).toBe("pago");
  });

  it("código informado em outra mudança que não é envio é ignorado", async () => {
    const p = await createOrder(item, await clienteDeTeste());
    expect(await updateOrderStatus(p.id, "pago", { tracking: "AB123456789BR" })).toBe("ok");
    expect(await codigoNoBanco(p.id)).toBeNull();
  });
});

describe("corrigir o código depois do envio", () => {
  it("troca ou apaga o código de pedido enviado ou entregue", async () => {
    const p = await pedidoPago(await clienteDeTeste());
    await updateOrderStatus(p.id, "enviado");
    expect(await setTrackingCode(p.id, "cd 987654321 br")).toBe("ok");
    expect(await codigoNoBanco(p.id)).toBe("CD987654321BR");
    expect(await setTrackingCode(p.id, "")).toBe("ok");
    expect(await codigoNoBanco(p.id)).toBeNull();
  });

  it("recusa código em pedido que ainda não foi enviado, inexistente ou com código inválido", async () => {
    const p = await pedidoPago(await clienteDeTeste());
    expect(await setTrackingCode(p.id, "AB123456789BR")).toBe("invalido");
    await updateOrderStatus(p.id, "enviado");
    expect(await setTrackingCode(p.id, "@@")).toBe("rastreio-invalido");
    expect(await setTrackingCode(999999, "AB123456789BR")).toBe("nao-encontrado");
  });
});

describe("o banco também confere (mesmo se o código do servidor errar)", () => {
  it("recusa código em pedido não enviado e código fora do formato", async () => {
    const p = await createOrder(item, await clienteDeTeste());
    const db = await getDb();
    await expect(db.update(orders).set({ trackingCode: "AB123456789BR" }).where(eq(orders.id, p.id))).rejects.toThrow();
    await updateOrderStatus(p.id, "pago");
    await updateOrderStatus(p.id, "enviado");
    await expect(db.update(orders).set({ trackingCode: "ab" }).where(eq(orders.id, p.id))).rejects.toThrow();
  });
});

describe("o cliente só vê o rastreio do próprio pedido", () => {
  it("pedido de outro cliente continua indistinguível de inexistente", async () => {
    const dona = await clienteDeTeste("dona@exemplo.com");
    const outro = await clienteDeTeste("outro@exemplo.com");
    const p = await pedidoPago(dona);
    await updateOrderStatus(p.id, "enviado", { tracking: "AB123456789BR" });
    expect(await getCustomerOrder(outro, p.number)).toBeNull();
  });
});
