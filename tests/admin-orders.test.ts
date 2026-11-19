// ============================================================================
// Testes do PAINEL DO DONO em relação a pedidos (src/server/admin/orders.ts e dashboard.ts):
// o fluxo de status, o cancelamento pelo painel e os números do resumo.
// Por que testar: o dono depende destes botões e contadores para tocar a loja, e um status errado
// pode devolver estoque indevido ou esconder um pedido pago.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { NEXT_STATUS, listOrders, updateOrderStatus } from "@/server/admin/orders";
import { dashboardStats } from "@/server/admin/dashboard";
import { createOrder } from "@/server/orders";
import { setProductActive, setProductStock } from "@/server/admin/products";
import { ORDER_STATUS, type OrderStatus } from "@/server/db/schema";
import { resetDb, stockOf } from "./helpers/db";

// Um pedido padrão: 2 peças da GT3 (usado para criar pedidos nos testes).
const GT3 = { slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 2 };

beforeEach(resetDb);

describe("fluxo de status do pedido", () => {
  // O caminho completo de um pedido que dá certo.
  it("segue pendente, pago, enviado e entregue", async () => {
    const p = await createOrder([GT3]);
    expect(await updateOrderStatus(p.id, "pago")).toBe("ok");
    expect(await updateOrderStatus(p.id, "enviado")).toBe("ok");
    expect(await updateOrderStatus(p.id, "entregue")).toBe("ok");
    expect((await listOrders("entregue")).map((o) => o.id)).toEqual([p.id]);
  });

  it("recusa saltos e voltas", async () => {
    const p = await createOrder([GT3]);
    expect(await updateOrderStatus(p.id, "enviado")).toBe("invalido"); // pula o pago
    expect(await updateOrderStatus(p.id, "entregue")).toBe("invalido");
    await updateOrderStatus(p.id, "pago");
    expect(await updateOrderStatus(p.id, "pendente")).toBe("invalido"); // não volta
  });

  it("recusa status que não existe e pedido que não existe", async () => {
    const p = await createOrder([GT3]);
    // O "as OrderStatus" engana o TypeScript de propósito: simula um valor adulterado vindo do navegador.
    expect(await updateOrderStatus(p.id, "sumiu" as OrderStatus)).toBe("invalido");
    expect(await updateOrderStatus(99999, "pago")).toBe("nao-encontrado");
  });

  // Cancelar pelo painel deve devolver as peças E encerrar o pedido de vez (nenhuma mudança depois).
  it("cancelar pelo painel devolve o estoque, e pedido cancelado fica encerrado", async () => {
    const p = await createOrder([GT3]);
    await updateOrderStatus(p.id, "pago");
    expect(await updateOrderStatus(p.id, "cancelado")).toBe("ok");
    expect(await stockOf("oversized-gt3-rs")).toBe(12);
    for (const s of ORDER_STATUS) expect(await updateOrderStatus(p.id, s), s).toBe("invalido");
  });

  it("entregue e cancelado não têm próximo passo", () => {
    expect(NEXT_STATUS.entregue).toEqual([]);
    expect(NEXT_STATUS.cancelado).toEqual([]);
  });

  // Dois funcionários clicam "Marcar como pago" no mesmo instante: só um deve valer.
  it("duas pessoas mudando o mesmo pedido: só uma vence", async () => {
    const p = await createOrder([GT3]);
    const r = await Promise.all([updateOrderStatus(p.id, "pago"), updateOrderStatus(p.id, "pago")]);
    expect([...r].sort()).toEqual(["invalido", "ok"]);
  });
});

describe("painel do dono", () => {
  // Os contadores da tela inicial (/admin) e a lista de estoque baixo (3 peças ou menos).
  it("conta pedidos por status e lista estoque baixo", async () => {
    const a = await createOrder([GT3]);
    await createOrder([GT3]);
    await updateOrderStatus(a.id, "pago");
    await setProductStock("camisa-mumia", 2);
    const s = await dashboardStats();
    expect(s.pendentes).toBe(1);
    expect(s.pagos).toBe(1);
    expect(s.lowStock.map((p) => p.slug)).toContain("camisa-mumia");
    expect(s.lowStock.map((p) => p.slug)).not.toContain("oversized-gt3-rs");
  });

  // O ajuste rápido de estoque aceita só inteiros de 0 a 100000 e produtos que existem.
  it("ajuste de estoque recusa valores inválidos", async () => {
    for (const v of [-1, 1.5, NaN, 100001]) expect(await setProductStock("camisa-mumia", v), String(v)).toBe(false);
    expect(await stockOf("camisa-mumia")).toBe(5);
    expect(await setProductStock("nao-existe", 3)).toBe(false);
  });

  // Produto que o dono escondeu da loja não deve gerar alerta de "estoque baixo".
  it("produto oculto não aparece como estoque baixo", async () => {
    await setProductStock("camisa-mumia", 1);
    await setProductActive("camisa-mumia", false);
    expect((await dashboardStats()).lowStock.map((p) => p.slug)).not.toContain("camisa-mumia");
  });
});
