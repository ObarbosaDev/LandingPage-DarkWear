// ============================================================================
// Dados de DEMONSTRAÇÃO para o banco LOCAL (rodar no terminal, fora do servidor):
//
//   npm run db:demo               cria clientes, pedidos em todas as etapas e cupons de exemplo
//   npm run db:demo -- --refazer  apaga os dados de demonstração e cria de novo
//
// Para que serve: ver o painel (esteira, caderneta, cupons, diário) e a conta do cliente com conteúdo de verdade,
// sem digitar nada à mão. Todos os clientes de demonstração têm e-mail @demo.darkwear.local e a MESMA senha (abaixo),
// e só existem para teste.
//
// SEGURANÇA: se DATABASE_URL existir (banco de produção), o comando se recusa a rodar: dados de mentira nunca vão
// para a loja de verdade. Pare o servidor de desenvolvimento antes (dois processos no mesmo banco embutido corrompem).
// ============================================================================

import { existsSync } from "node:fs";

/** A senha de todos os clientes de demonstração (só vale no banco local). */
const SENHA_DEMO = "demonstracao forte 123";
const DOMINIO = "demo.darkwear.local";

const CLIENTES = [
  ["Ana Souza", "11987650001"],
  ["Bruno Lima", "21987650002"],
  ["Carla Dias", "31987650003"],
  ["Diego Ramos", "41987650004"],
  ["Elisa Prado", "51987650005"],
  ["Fábio Neves", "61987650006"],
  ["Gabi Torres", "71987650007"],
  ["Hugo Matos", "81987650008"],
] as const;

const ENDERECOS = [
  { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: "Apto 51", district: "Bela Vista", city: "São Paulo", state: "SP" },
  { zip: "20040020", street: "Rua da Assembleia", number: "10", complement: null, district: "Centro", city: "Rio de Janeiro", state: "RJ" },
  { zip: "30130010", street: "Avenida Afonso Pena", number: "1500", complement: "Sala 3", district: "Centro", city: "Belo Horizonte", state: "MG" },
  { zip: "80010000", street: "Rua XV de Novembro", number: "700", complement: null, district: "Centro", city: "Curitiba", state: "PR" },
] as const;

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (process.env.DATABASE_URL) {
    console.error("Recusado: DATABASE_URL está definida (banco de produção). Os dados de demonstração só podem ir para o banco local.");
    process.exitCode = 1;
    return;
  }
  const refazer = process.argv.includes("--refazer");

  const { getDb } = await import("../src/server/db");
  const { customers, orders, productStock, coupons } = await import("../src/server/db/schema");
  const { like, eq, inArray } = await import("drizzle-orm");
  const { hashPassword } = await import("../src/server/customers/password");
  const { saveAddress } = await import("../src/server/customers/address");
  const { createOrder } = await import("../src/server/orders");
  const { updateOrderStatus } = await import("../src/server/admin/orders");
  const { createCoupon } = await import("../src/server/coupons");

  const db = await getDb();
  const existentes = await db.select({ id: customers.id }).from(customers).where(like(customers.email, `%@${DOMINIO}`));

  if (existentes.length > 0 && !refazer) {
    console.log("Já existem dados de demonstração. Para apagar e criar de novo: npm run db:demo -- --refazer");
    return;
  }
  if (existentes.length > 0) {
    const ids = existentes.map((c) => c.id);
    const meus = await db.select({ id: orders.id }).from(orders).where(inArray(orders.customerId, ids));
    if (meus.length) {
      // Os pedidos saem (itens, histórico e pagamentos vão junto, por cascata). O estoque é refeito logo abaixo.
      await db.delete(orders).where(inArray(orders.id, meus.map((o) => o.id)));
    }
    await db.delete(customers).where(inArray(customers.id, ids));
    await db.delete(coupons).where(inArray(coupons.code, ["DEMO10", "DEMO15"]));
    console.log(`Dados de demonstração antigos apagados (${ids.length} clientes).`);
  }

  // Estoque de sobra em todas as variações, para os pedidos de exemplo não faltarem.
  await db.update(productStock).set({ stock: 60 });
  const produtos = await db.query.products.findMany({ where: (p, { eq: igual }) => igual(p.active, true) });
  if (produtos.length === 0) throw new Error("Não há produtos ativos para fazer pedidos de exemplo.");

  // Cupons de exemplo.
  await createCoupon({ code: "DEMO10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true });
  await createCoupon({ code: "DEMO15", kind: "fixed", value: 1500, minOrderCents: 15000, maxUses: 20, startsAt: null, expiresAt: null, active: true });

  // Clientes (todos com a mesma senha de demonstração) e endereço.
  const hash = await hashPassword(SENHA_DEMO);
  const ids: number[] = [];
  for (const [i, [nome, cel]] of CLIENTES.entries()) {
    const email = `${nome.split(" ")[0].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()}@${DOMINIO}`;
    const [c] = await db
      .insert(customers)
      .values({ name: nome, email, phone: cel, passwordHash: hash, privacyAcceptedAt: new Date(Date.now() - (30 - i) * 86_400_000), createdAt: new Date(Date.now() - (30 - i * 3) * 86_400_000) })
      .returning({ id: customers.id });
    await saveAddress(c.id, ENDERECOS[i % ENDERECOS.length]);
    ids.push(c.id);
  }

  // Pedidos: cada cliente faz alguns, em etapas diferentes (do cancelado ao entregue), com datas espalhadas.
  const etapas = ["pendente", "pago", "enviado", "entregue", "entregue", "cancelado", "pago", "pendente", "enviado", "entregue", "pago", "pendente"] as const;
  let feitos = 0;
  for (const [n, etapa] of etapas.entries()) {
    const cliente = ids[n % ids.length];
    const p = produtos[n % produtos.length];
    const tam = p.sizes[n % p.sizes.length];
    const cor = p.colors[n % p.colors.length];
    // O primeiro pedido de alguns clientes usa o cupom de exemplo (cada cliente só usa uma vez).
    const cupom = n < ids.length && n % 3 === 0 ? "DEMO10" : undefined;
    const o = await createOrder([{ slug: p.slug, size: tam, color: cor, qty: 1 + (n % 3) }], cliente, ENDERECOS[n % ENDERECOS.length], { coupon: cupom });
    if (etapa === "cancelado") await updateOrderStatus(o.id, "cancelado", { actor: "demo@darkwear.local" });
    else {
      if (["pago", "enviado", "entregue"].includes(etapa)) await updateOrderStatus(o.id, "pago", { actor: "demo@darkwear.local" });
      if (["enviado", "entregue"].includes(etapa)) await updateOrderStatus(o.id, "enviado", { actor: "demo@darkwear.local", tracking: n % 2 ? `AB12345${String(n).padStart(4, "0")}BR` : "" });
      if (etapa === "entregue") await updateOrderStatus(o.id, "entregue", { actor: "demo@darkwear.local" });
    }
    // Espalha as datas pelos últimos dias (pedidos mais antigos primeiro).
    await db.update(orders).set({ createdAt: new Date(Date.now() - (etapas.length - n) * 9 * 3_600_000) }).where(eq(orders.id, o.id));
    feitos++;
  }

  console.log(`\nDemonstração criada: ${ids.length} clientes, ${feitos} pedidos, 2 cupons (DEMO10 e DEMO15).`);
  console.log(`Entre como cliente com qualquer e-mail abaixo e a senha: ${SENHA_DEMO}`);
  for (const [nome] of CLIENTES) console.log(`  ${nome.split(" ")[0].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()}@${DOMINIO}`);
  console.log("\nPara ver o painel, crie um administrador: npm run admin:criar -- --email voce@exemplo.com --nome \"Seu Nome\" --celular 11999999999");
}

main()
  .catch((e) => {
    console.error(`\nErro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
