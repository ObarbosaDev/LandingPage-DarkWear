// ============================================================================
// Testes dos DADOS do painel novo: cliente em cada pedido, busca de pedidos, números do resumo (faturamento
// do mês, pedidos de hoje, pagamentos a conferir) e a lista de clientes com total gasto.
// Por que testar: o dono decide o dia pelo que o painel mostra. Número errado vira decisão errada
// (cobrar quem já pagou, deixar pedido pago parado). E a busca recebe texto digitado, que tem de ser
// tratado como texto (nunca como SQL nem como curinga).
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, orders, payments } from "@/server/db/schema";
import { anonymizeCustomer, authenticate } from "@/server/customers";
import { createOrder } from "@/server/orders";
import { listOrders } from "@/server/admin/orders";
import { contagensDoPainel, dashboardStats } from "@/server/admin/dashboard";
import { listCustomers, resetCustomerPassword } from "@/server/admin/customers";
import { clienteDeTeste, resetDb } from "./helpers/db";

beforeEach(resetDb);

const item = (qty = 1) => [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty }];
const setStatus = async (id: number, status: "pendente" | "pago" | "enviado" | "entregue" | "cancelado") =>
  (await getDb()).update(orders).set({ status }).where(eq(orders.id, id));

describe("listOrders: cliente em cada pedido", () => {
  it("traz nome, e-mail e celular do cliente; pedido antigo sem dono vem com customer null", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    await (await getDb()).update(customers).set({ name: "Ana Souza" }).where(eq(customers.id, ana));
    const p = await createOrder(item(), ana);
    const antigo = await createOrder(item(), ana);
    await (await getDb()).update(orders).set({ customerId: null }).where(eq(orders.id, antigo.id));

    const lista = await listOrders();
    expect(lista.find((o) => o.id === p.id)?.customer).toEqual({ id: ana, name: "Ana Souza", email: "ana@exemplo.com", phone: "11987654321" });
    expect(lista.find((o) => o.id === antigo.id)?.customer).toBeNull();
  });

  it("nunca devolve o hash da senha do cliente", async () => {
    const ana = await clienteDeTeste();
    await createOrder(item(), ana);
    expect(JSON.stringify(await listOrders())).not.toMatch(/hash|scrypt/i);
  });
});

describe("listOrders: busca", () => {
  async function cenario() {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia.silva@exemplo.com");
    await (await getDb()).update(customers).set({ name: "Ana Souza" }).where(eq(customers.id, ana));
    await (await getDb()).update(customers).set({ name: "Bia Silva" }).where(eq(customers.id, bia));
    const pa = await createOrder(item(), ana);
    const pb = await createOrder(item(), bia);
    return { ana, bia, pa, pb };
  }

  it("acha por número do pedido, com ou sem o prefixo DW- e os zeros", async () => {
    const { pa, pb } = await cenario();
    for (const q of [pa.number, pa.number.toLowerCase(), String(pa.id), `DW-${pa.id}`, ` ${pa.number} `]) {
      expect((await listOrders(undefined, 100, q)).map((o) => o.id), q).toEqual([pa.id]);
    }
    expect((await listOrders(undefined, 100, pb.number)).map((o) => o.id)).toEqual([pb.id]);
  });

  it("acha por parte do nome ou do e-mail do cliente, sem diferenciar maiúsculas", async () => {
    const { pa, pb } = await cenario();
    expect((await listOrders(undefined, 100, "souza")).map((o) => o.id)).toEqual([pa.id]);
    expect((await listOrders(undefined, 100, "SILVA")).map((o) => o.id)).toEqual([pb.id]);
    expect((await listOrders(undefined, 100, "bia.silva@")).map((o) => o.id)).toEqual([pb.id]);
    expect((await listOrders(undefined, 100, "exemplo.com")).map((o) => o.id).sort()).toEqual([pa.id, pb.id].sort());
  });

  it("combina com o filtro de status", async () => {
    const { pa, pb } = await cenario();
    await setStatus(pa.id, "pago");
    expect((await listOrders("pago", 100, "exemplo")).map((o) => o.id)).toEqual([pa.id]);
    expect((await listOrders("pendente", 100, "exemplo")).map((o) => o.id)).toEqual([pb.id]);
  });

  it("busca vazia ou só de espaços não filtra nada", async () => {
    await cenario();
    expect(await listOrders(undefined, 100, "   ")).toHaveLength(2);
    expect(await listOrders(undefined, 100, "")).toHaveLength(2);
  });

  // O texto digitado é TEXTO: "%" e "_" não são curingas, e aspas não quebram a consulta.
  it("trata o que foi digitado como texto, nunca como curinga nem como SQL", async () => {
    await cenario();
    for (const q of ["%", "_", "%%", "a%a", "' OR '1'='1", "'; DROP TABLE orders; --", "\\", "ana\\"]) {
      expect(await listOrders(undefined, 100, q), q).toEqual([]);
    }
    expect(await listOrders()).toHaveLength(2); // a tabela segue de pé
  });

  it("tipos que não são texto não quebram a busca", async () => {
    await cenario();
    for (const q of [undefined, null, 5, {}] as unknown[]) expect(await listOrders(undefined, 100, q as string)).toHaveLength(2);
  });
});

describe("dashboardStats: números novos", () => {
  it("faturamento do mês soma só pedidos pagos, enviados e entregues deste mês", async () => {
    const ana = await clienteDeTeste();
    const [a, b, c, d, e] = [await createOrder(item(1), ana), await createOrder(item(1), ana), await createOrder(item(1), ana), await createOrder(item(2), ana), await createOrder(item(1), ana)];
    await setStatus(a.id, "pago");
    await setStatus(b.id, "enviado");
    await setStatus(c.id, "entregue");
    await setStatus(d.id, "cancelado"); // não conta
    // e continua pendente: não conta
    void e;
    // Um pedido pago de MESES atrás também não conta no mês.
    const antigo = await createOrder(item(1), ana);
    await setStatus(antigo.id, "pago");
    await (await getDb()).update(orders).set({ createdAt: sql`now() - interval '70 days'` }).where(eq(orders.id, antigo.id));

    expect((await dashboardStats()).faturamentoMesCents).toBe(3 * 8990);
  });

  it("pedidos de hoje conta só os criados hoje (no horário de São Paulo)", async () => {
    const ana = await clienteDeTeste();
    await createOrder(item(), ana);
    await createOrder(item(), ana);
    const velho = await createOrder(item(), ana);
    await (await getDb()).update(orders).set({ createdAt: sql`now() - interval '3 days'` }).where(eq(orders.id, velho.id));
    expect((await dashboardStats()).pedidosHoje).toBe(2);
  });

  it("pagamentos a conferir: aprovado em pedido cancelado ou com valor diferente; nunca os normais", async () => {
    const ana = await clienteDeTeste();
    const pago = await createOrder(item(), ana); // aprovado e pedido pago: tudo certo
    const cancelado = await createOrder(item(), ana); // aprovado, mas o pedido cancelou: conferir
    const divergente = await createOrder(item(), ana); // aprovado com valor diferente: conferir
    const recusado = await createOrder(item(), ana); // recusado: não é para conferir
    const db = await getDb();
    await setStatus(pago.id, "pago");
    await setStatus(cancelado.id, "cancelado");
    await db.insert(payments).values([
      { orderId: pago.id, provider: "mercadopago", providerPaymentId: "1", status: "aprovado", amountCents: 8990 },
      { orderId: cancelado.id, provider: "mercadopago", providerPaymentId: "2", status: "aprovado", amountCents: 8990 },
      { orderId: divergente.id, provider: "mercadopago", providerPaymentId: "3", status: "aprovado", amountCents: 100 },
      { orderId: recusado.id, provider: "mercadopago", providerPaymentId: "4", status: "recusado", amountCents: 8990 },
    ]);
    expect((await dashboardStats()).pagamentosParaConferir).toBe(2);
  });

  it("um pedido com dois pagamentos aprovados conta uma vez só", async () => {
    const ana = await clienteDeTeste();
    const p = await createOrder(item(), ana);
    await setStatus(p.id, "cancelado");
    await (await getDb()).insert(payments).values([
      { orderId: p.id, provider: "mercadopago", providerPaymentId: "10", status: "aprovado", amountCents: 8990 },
      { orderId: p.id, provider: "mercadopago", providerPaymentId: "11", status: "aprovado", amountCents: 8990 },
    ]);
    expect((await dashboardStats()).pagamentosParaConferir).toBe(1);
  });

  it("totais de clientes ignoram contas anonimizadas e contam administradores à parte", async () => {
    const a = await clienteDeTeste("a@exemplo.com");
    const b = await clienteDeTeste("b@exemplo.com");
    const c = await clienteDeTeste("c@exemplo.com");
    await (await getDb()).update(customers).set({ role: "admin" }).where(eq(customers.id, c));
    await anonymizeCustomer(b);
    void a;
    expect((await dashboardStats()).totalClientes).toBe(1); // só "a" é cliente ativo comum
  });

  it("sem nenhum dado, tudo vem zerado (nunca undefined ou NaN)", async () => {
    const s = await dashboardStats();
    expect(s).toMatchObject({ faturamentoMesCents: 0, pedidosHoje: 0, pagamentosParaConferir: 0, totalClientes: 0, pendentes: 0 });
  });
});

describe("listCustomers", () => {
  it("lista os clientes com quantidade de pedidos e total gasto (só pedidos pagos, enviados e entregues)", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia@exemplo.com");
    const p1 = await createOrder(item(1), ana);
    const p2 = await createOrder(item(2), ana);
    const p3 = await createOrder(item(1), ana);
    await createOrder(item(1), bia);
    await setStatus(p1.id, "pago");
    await setStatus(p2.id, "entregue");
    await setStatus(p3.id, "cancelado"); // conta como pedido, mas não como gasto

    const lista = await listCustomers();
    const a = lista.find((c) => c.id === ana)!;
    expect(a).toMatchObject({ email: "ana@exemplo.com", pedidos: 3, gastoCents: 3 * 8990, role: "cliente" });
    expect(lista.find((c) => c.id === bia)).toMatchObject({ pedidos: 1, gastoCents: 0 });
  });

  it("não lista contas anonimizadas e nunca devolve o hash da senha", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia@exemplo.com");
    await anonymizeCustomer(bia);
    const lista = await listCustomers();
    expect(lista.map((c) => c.id)).toEqual([ana]);
    expect(JSON.stringify(lista)).not.toMatch(/hash|scrypt/i);
  });

  it("busca por nome, e-mail ou celular, tratando o texto como texto", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const bia = await clienteDeTeste("bia@exemplo.com");
    await (await getDb()).update(customers).set({ name: "Ana Souza", phone: "11911112222" }).where(eq(customers.id, ana));
    await (await getDb()).update(customers).set({ name: "Bia Silva", phone: "21933334444" }).where(eq(customers.id, bia));
    expect((await listCustomers("souza")).map((c) => c.id)).toEqual([ana]);
    expect((await listCustomers("bia@")).map((c) => c.id)).toEqual([bia]);
    expect((await listCustomers("21933")).map((c) => c.id)).toEqual([bia]);
    expect((await listCustomers("(21) 93333")).map((c) => c.id)).toEqual([bia]); // máscara não atrapalha
    for (const q of ["%", "_", "' OR '1'='1", "\\"]) expect(await listCustomers(q), q).toEqual([]);
    expect(await listCustomers("   ")).toHaveLength(2);
  });

  it("administradores aparecem marcados", async () => {
    const adm = await clienteDeTeste("adm@exemplo.com");
    await (await getDb()).update(customers).set({ role: "admin" }).where(eq(customers.id, adm));
    expect((await listCustomers())[0]).toMatchObject({ id: adm, role: "admin" });
  });
});

describe("resetCustomerPassword (senha provisória de um cliente, pelo painel)", () => {
  it("gera uma senha provisória que entra uma vez e obriga a troca", async () => {
    const ana = await clienteDeTeste("ana@exemplo.com");
    const senha = await resetCustomerPassword(ana);
    expect(senha).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(await authenticate("ana@exemplo.com", senha)).toMatchObject({ id: ana, mustChangePassword: true, role: "cliente" });
  });

  // Administrador é gerido só pelo comando de terminal do dono: o painel nunca mexe na senha de um.
  it("RECUSA conta de administrador (isso é só pelo comando de terminal)", async () => {
    const adm = await clienteDeTeste("adm@exemplo.com");
    await (await getDb()).update(customers).set({ role: "admin" }).where(eq(customers.id, adm));
    await expect(resetCustomerPassword(adm)).rejects.toThrow(/administrador/i);
    expect(await authenticate("adm@exemplo.com", "qualquer")).toBeNull();
  });

  it("recusa conta inexistente, anonimizada ou id inválido", async () => {
    const ana = await clienteDeTeste();
    await anonymizeCustomer(ana);
    for (const id of [ana, 999999, 0, -1, 1.5, NaN]) await expect(resetCustomerPassword(id), String(id)).rejects.toThrow();
  });
});

describe("contagensDoPainel (os números pequenos da barra de navegação)", () => {
  it("conta pedidos pendentes e encomendas novas, e nada mais", async () => {
    const ana = await clienteDeTeste();
    const a = await createOrder(item(), ana);
    await createOrder(item(), ana);
    await createOrder(item(), ana);
    await setStatus(a.id, "pago"); // saiu dos pendentes
    expect(await contagensDoPainel()).toMatchObject({ pedidosPendentes: 2, encomendasNovas: 0 });
  });

  it("sem nada, devolve zeros", async () => {
    expect(await contagensDoPainel()).toEqual({ pedidosPendentes: 0, encomendasNovas: 0, pedidosHoje: 0, pagamentosParaConferir: 0 });
  });

  // Os mesmos números do ticker (a faixa que corre no topo do painel): hoje e pagamentos a conferir.
  it("também traz os pedidos de hoje e os pagamentos a conferir, para a faixa do topo", async () => {
    const ana = await clienteDeTeste();
    const a = await createOrder(item(), ana);
    await createOrder(item(), ana);
    await setStatus(a.id, "cancelado");
    await (await getDb()).insert(payments).values({ orderId: a.id, provider: "mercadopago", providerPaymentId: "55", status: "aprovado", amountCents: 8990 });
    expect(await contagensDoPainel()).toEqual({ pedidosPendentes: 1, encomendasNovas: 0, pedidosHoje: 2, pagamentosParaConferir: 1 });
  });
});

describe("dashboardStats: fechamento do mês (ticket médio)", () => {
  it("conta os pedidos pagos do mês e calcula o ticket médio (faturamento ÷ pedidos pagos)", async () => {
    const ana = await clienteDeTeste();
    const a = await createOrder(item(1), ana); // 8990
    const b = await createOrder(item(3), ana); // 26970
    const c = await createOrder(item(1), ana); // pendente: não conta
    await setStatus(a.id, "pago");
    await setStatus(b.id, "entregue");
    void c;
    const s = await dashboardStats();
    expect(s.pedidosPagosMes).toBe(2);
    expect(s.faturamentoMesCents).toBe(8990 + 26970);
    expect(s.ticketMedioCents).toBe(Math.round((8990 + 26970) / 2));
  });

  it("sem pedidos pagos, ticket médio e contagem são zero (nunca divisão por zero)", async () => {
    const s = await dashboardStats();
    expect(s.pedidosPagosMes).toBe(0);
    expect(s.ticketMedioCents).toBe(0);
    expect(Number.isFinite(s.ticketMedioCents)).toBe(true);
  });
});

