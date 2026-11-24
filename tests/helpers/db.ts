// ============================================================================
// Ajudantes de banco para os testes: deixar o banco num estado conhecido e ler o estoque.
// ============================================================================

import { getDb } from "@/server/db";
import { customOrders, customers, loginAttempts, orderItems, orders, productStock, products } from "@/server/db/schema";
import { PRODUCTS } from "@/server/db/seed-data";
import { eq, notInArray } from "drizzle-orm";

/** Em qual variação (tamanho|cor) cada peça de exemplo guarda TODO o estoque nos testes. */
export const ESTOQUE_DE_TESTE: Record<string, string> = {
  "oversized-gt3-rs": "M|Preta",
  "camisa-mumia": "G|Branca",
  "eu-faco-programa": "M|Preta",
};

// Volta o banco ao estado inicial: sem pedidos e com o catálogo de exemplo, igual ao de fábrica.
// Chamada no início de cada teste (beforeEach) para um teste nunca depender do que outro fez.
export async function resetDb() {
  const db = await getDb();
  // A ordem importa: os itens do pedido dependem do pedido, e os pedidos dependem dos produtos
  // (chave estrangeira), então saem primeiro. O histórico de status some junto com o pedido (cascade).
  await db.delete(orderItems);
  await db.delete(orders);
  // Os clientes saem depois dos pedidos (o pedido aponta para o cliente).
  await db.delete(customers);
  await db.delete(customOrders);
  await db.delete(loginAttempts);
  // Apaga produtos que um teste tenha criado (os que não fazem parte do catálogo de exemplo).
  await db.delete(products).where(
    notInArray(
      products.slug,
      PRODUCTS.map((p) => p.slug),
    ),
  );
  for (const p of PRODUCTS) {
    // Recria o produto se um teste o apagou (não faz nada se ele existe)...
    await db
      .insert(products)
      .values({
        slug: p.slug,
        name: p.name,
        priceCents: p.priceCents,
        description: p.description,
        category: p.category,
        sizes: p.sizes,
        colors: p.colors,
        stock: p.stock,
        image: p.image ?? null,
        photoBg: p.photoBg ?? null,
      })
      .onConflictDoNothing();
    // ...e devolve o estoque inicial e reativa (um teste pode ter alterado ou ocultado). O estoque de teste fica
    // CONCENTRADO numa variação (as outras em 0): assim os testes de compra, que usam sempre o mesmo tamanho e cor,
    // enxergam o total da peça como antes, e o total (products.stock) vem do gatilho do banco.
    await db.update(products).set({ sizes: p.sizes, colors: p.colors, active: true }).where(eq(products.slug, p.slug));
    await db.delete(productStock).where(eq(productStock.productSlug, p.slug));
    const principal = ESTOQUE_DE_TESTE[p.slug];
    await db.insert(productStock).values(
      Object.keys(p.variants).map((chave) => {
        const [size, color] = chave.split("|");
        return { productSlug: p.slug, size, color, stock: chave === principal ? p.stock : 0 };
      }),
    );
  }
}

/** Quantas peças há em estoque de um produto, lido direto do banco. */
export async function stockOf(slug: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ stock: products.stock }).from(products).where(eq(products.slug, slug));
  return row.stock;
}

/**
 * Um cliente de teste, criado direto no banco (sem passar pelo cadastro, que é lento por causa do hash
 * da senha). Se já existe um com o e-mail, devolve o mesmo (também quando várias chamadas chegam juntas). Os pedidos dos testes precisam de um dono,
 * porque comprar exige conta.
 */
export async function clienteDeTeste(email = "cliente@teste.com"): Promise<number> {
  const db = await getDb();
  await db
    .insert(customers)
    // O hash não é de uma senha de verdade: serve só para satisfazer a restrição "não vazio" do banco.
    .values({ name: "Cliente de Teste", email, phone: "11987654321", passwordHash: "hash-de-teste", privacyAcceptedAt: new Date() })
    // Vários testes pedem o cliente ao mesmo tempo (pedidos simultâneos): quem perder a corrida só lê o que já existe.
    .onConflictDoNothing({ target: customers.email });
  const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email));
  return c.id;
}
