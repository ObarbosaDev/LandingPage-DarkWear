// ============================================================================
// Testes da CARGA DA ESTEIRA (carregarEsteira em src/server/admin/orders.ts): quantos pedidos aparecem em cada
// coluna, a paginação e os totais.
// O que mais importa: pedido EM ABERTO (pendente, pago, enviado) nunca some do quadro por causa de muitos pedidos
// novos já encerrados; os totais da coluna são de TODOS os pedidos dela (não só dos que aparecem); e a paginação
// de uma coluna não perde nem repete pedido.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LIMITE_ABERTOS, LIMITE_ENCERRADOS, POR_PAGINA, carregarEsteira, listOrders, updateOrderStatus } from "@/server/admin/orders";
import { getDb } from "@/server/db";
import { orders, payments, productStock } from "@/server/db/schema";
import { createOrder } from "@/server/orders";
import { clienteDeTeste, resetDb } from "./helpers/db";

beforeEach(resetDb);

/** Cria N pedidos de R$ 89,90 e devolve os ids, do mais antigo ao mais novo (datas bem separadas). */
async function criar(n: number, cliente: number, status?: "pago" | "enviado" | "entregue" | "cancelado") {
  const db = await getDb();
  // Estoque de sobra para os pedidos em massa (a peça de exemplo tem poucas unidades).
  await db.update(productStock).set({ stock: 100_000 }).where(eq(productStock.productSlug, "eu-faco-programa"));
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = await createOrder([{ slug: "eu-faco-programa", size: "M", color: "Preta", qty: 1 }], cliente);
    ids.push(p.id);
  }
  if (status) {
    // Direto no banco: é mais rápido que passar o fluxo de cada pedido (aqui só importa o status).
    await db.update(orders).set({ status }).where(eq(orders.customerId, cliente));
  }
  return ids;
}
/** Dá a cada pedido uma data diferente, em ordem de id (o id menor é o mais antigo). */
async function datar() {
  const db = await getDb();
  const todos = await db.select({ id: orders.id }).from(orders);
  for (const { id } of todos) await db.update(orders).set({ createdAt: new Date(Date.UTC(2026, 0, 1) + id * 60_000) }).where(eq(orders.id, id));
}

describe("a esteira nunca esconde pedido em aberto", () => {
  it("pendente antigo continua na coluna mesmo com muitos pedidos novos já entregues", async () => {
    const dono = await clienteDeTeste("dono@exemplo.com");
    const [antigo] = await criar(1, dono);
    const outro = await clienteDeTeste("outro@exemplo.com");
    await criar(LIMITE_ENCERRADOS + 30, outro, "entregue");
    await datar();
    const e = await carregarEsteira({});
    const pendente = e.colunas.find((c) => c.status === "pendente")!;
    expect(pendente.pedidos.map((p) => p.id)).toContain(antigo);
    expect(pendente.total).toBe(1);
  });

  it("os abertos aparecem inteiros até o limite, e a coluna avisa quando há mais", async () => {
    const dono = await clienteDeTeste();
    await criar(LIMITE_ABERTOS + 5, dono);
    await datar();
    const pendente = (await carregarEsteira({})).colunas.find((c) => c.status === "pendente")!;
    expect(pendente.pedidos).toHaveLength(LIMITE_ABERTOS);
    expect(pendente.total).toBe(LIMITE_ABERTOS + 5);
    expect(pendente.temMais).toBe(true);
    // Os mostrados são os MAIS RECENTES.
    const ids = pendente.pedidos.map((p) => p.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  }, 120_000);
});

describe("encerrados na visão geral", () => {
  it("entregues e cancelados mostram só os mais recentes, mas os totais contam todos", async () => {
    const dono = await clienteDeTeste();
    await criar(LIMITE_ENCERRADOS + 7, dono, "entregue");
    await datar();
    const e = await carregarEsteira({});
    const entregue = e.colunas.find((c) => c.status === "entregue")!;
    expect(entregue.pedidos).toHaveLength(LIMITE_ENCERRADOS);
    expect(entregue.total).toBe(LIMITE_ENCERRADOS + 7);
    expect(entregue.somaCents).toBe((LIMITE_ENCERRADOS + 7) * 7990);
    expect(entregue.temMais).toBe(true);
  });
});

describe("uma coluna só, com paginação", () => {
  it("páginas seguidas cobrem todos os pedidos, sem perder nem repetir", async () => {
    const dono = await clienteDeTeste();
    const total = POR_PAGINA * 2 + 5;
    await criar(total, dono, "entregue");
    await datar();
    const vistos: number[] = [];
    for (const pagina of [1, 2, 3]) {
      const e = await carregarEsteira({ filtro: "entregue", pagina });
      const col = e.colunas[0];
      expect(col.total).toBe(total);
      vistos.push(...col.pedidos.map((p) => p.id));
      expect(col.temMais).toBe(pagina < 3);
    }
    expect(vistos).toHaveLength(total);
    expect(new Set(vistos).size).toBe(total);
    // Do mais novo para o mais antigo, atravessando as páginas.
    expect(vistos).toEqual([...vistos].sort((a, b) => b - a));
  }, 120_000);

  it("página inválida (zero, negativa, texto, enorme) vira a primeira ou fica vazia, sem quebrar", async () => {
    const dono = await clienteDeTeste();
    await criar(3, dono, "entregue");
    for (const ruim of [0, -4, 1.7, Number.NaN]) {
      expect((await carregarEsteira({ filtro: "entregue", pagina: ruim })).colunas[0].pedidos, String(ruim)).toHaveLength(3);
    }
    const alem = await carregarEsteira({ filtro: "entregue", pagina: 9999 });
    expect(alem.colunas[0].pedidos).toEqual([]);
    expect(alem.colunas[0].total).toBe(3);
  });
});

describe("busca e conferência", () => {
  it("a busca vale para cada coluna e para os totais", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia@exemplo.com");
    await criar(2, ana);
    await criar(3, bia);
    const e = await carregarEsteira({ busca: "ana@" });
    const pendente = e.colunas.find((c) => c.status === "pendente")!;
    expect(pendente.total).toBe(2);
    expect(pendente.pedidos).toHaveLength(2);
    expect(pendente.somaCents).toBe(2 * 7990);
  });

  it("'só conferir' mostra apenas pedidos com pagamento aprovado que não ficou pago", async () => {
    const dono = await clienteDeTeste();
    const [a, b] = await criar(2, dono);
    const db = await getDb();
    // Pedido A: pagamento aprovado com valor errado (alerta). Pedido B: sem pagamento nenhum.
    await db.insert(payments).values({ orderId: a, provider: "mercadopago", providerPaymentId: "p1", status: "aprovado", method: "credit_card", amountCents: 100 });
    const e = await carregarEsteira({ soConferir: true });
    const ids = e.colunas.flatMap((c) => c.pedidos.map((p) => p.id));
    expect(ids).toEqual([a]);
    expect(ids).not.toContain(b);
    expect(e.colunas.find((c) => c.status === "pendente")!.total).toBe(1);
  });
});

describe("listOrders com deslocamento", () => {
  it("offset pula os mais recentes; sem offset nada muda", async () => {
    const dono = await clienteDeTeste();
    await criar(5, dono);
    await datar();
    const todos = await listOrders("pendente", 10);
    const pulando = await listOrders("pendente", 2, undefined, { offset: 2 });
    expect(pulando.map((o) => o.id)).toEqual(todos.slice(2, 4).map((o) => o.id));
  });

  it("limite e deslocamento absurdos são tratados como valores seguros", async () => {
    const dono = await clienteDeTeste();
    await criar(2, dono);
    expect(await listOrders("pendente", -5)).toEqual([]);
    expect((await listOrders("pendente", 10, undefined, { offset: -3 })).length).toBe(2);
    expect((await listOrders("pendente", 10, undefined, { offset: Number.NaN })).length).toBe(2);
  });

  it("o status 'pago' continua funcionando com o fluxo normal", async () => {
    const dono = await clienteDeTeste();
    const [a] = await criar(1, dono);
    await updateOrderStatus(a, "pago");
    expect((await carregarEsteira({})).colunas.find((c) => c.status === "pago")!.pedidos.map((p) => p.id)).toEqual([a]);
  });
});

// ---------------------------------------------------------------------------
// Caderneta de clientes: paginação.
// ---------------------------------------------------------------------------
import { CLIENTES_POR_PAGINA, contarClientes, listCustomers } from "@/server/admin/customers";
import { customers } from "@/server/db/schema";

describe("lista de clientes paginada", () => {
  it("as páginas cobrem todos os clientes, sem repetir, e o total é de todos", async () => {
    const db = await getDb();
    const n = CLIENTES_POR_PAGINA + 7;
    await db.insert(customers).values(
      Array.from({ length: n }, (_, i) => ({ name: `Cliente ${i}`, email: `c${i}@lista.com`, phone: "11987654321", passwordHash: "x", privacyAcceptedAt: new Date() })),
    );
    expect(await contarClientes()).toBe(n);
    const p1 = await listCustomers(undefined, 1);
    const p2 = await listCustomers(undefined, 2);
    expect(p1).toHaveLength(CLIENTES_POR_PAGINA);
    expect(p2).toHaveLength(7);
    expect(new Set([...p1, ...p2].map((c) => c.id)).size).toBe(n);
    expect(await listCustomers(undefined, 3)).toEqual([]);
  }, 60_000);

  it("página inválida vira a primeira; a busca vale também para o total", async () => {
    const db = await getDb();
    await db.insert(customers).values([
      { name: "Ana Souza", email: "ana@lista.com", phone: "11987654321", passwordHash: "x", privacyAcceptedAt: new Date() },
      { name: "Bia Lima", email: "bia@lista.com", phone: "11987654322", passwordHash: "x", privacyAcceptedAt: new Date() },
    ]);
    for (const ruim of [0, -2, 1.5, Number.NaN]) expect((await listCustomers(undefined, ruim)).length, String(ruim)).toBe(2);
    expect(await contarClientes("souza")).toBe(1);
    expect(await contarClientes("%")).toBe(0);
  });
});
