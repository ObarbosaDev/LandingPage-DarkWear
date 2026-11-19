// ============================================================================
// Testes de INTEGRIDADE DO BANCO (migrações 0003 e 0004): o próprio banco precisa RECUSAR dado
// inválido, mesmo que o código da aplicação tenha um bug ou um script grave direto.
//
// Estes testes falam SQL com o banco, sem passar pelas funções do sistema, de propósito: a ideia é
// provar que a última barreira (o banco) funciona sozinha. Também conferem o histórico de status e
// a consistência dos totais dos pedidos.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderItems, orders, orderStatusHistory, products } from "@/server/db/schema";
import { createOrder, expirePendingOrders } from "@/server/orders";
import { updateOrderStatus, listOrders } from "@/server/admin/orders";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);

/** Roda um SQL solto e devolve se o banco o recusou (true) ou aceitou (false). */
async function recusado(consulta: string): Promise<boolean> {
  const db = await getDb();
  try {
    await db.execute(sql.raw(consulta));
    return false;
  } catch {
    return true;
  }
}

// Um INSERT de produto válido, onde cada teste troca só um pedaço.
const produto = (trocas: Record<string, string> = {}) => {
  const v = {
    slug: "'camisa-nova'",
    name: "'Camisa Nova'",
    category: "'Pronta entrega'",
    sizes: `'["M"]'::jsonb`,
    colors: `'["Preta"]'::jsonb`,
    photo_bg: "NULL",
    image: "NULL",
    ...trocas,
  };
  return `INSERT INTO products (slug, name, price_cents, category, sizes, colors, stock, photo_bg, image)
          VALUES (${v.slug}, ${v.name}, 1000, ${v.category}, ${v.sizes}, ${v.colors}, 1, ${v.photo_bg}, ${v.image})`;
};

describe("regras do banco: produtos", () => {
  it("aceita um produto válido (a base dos testes abaixo)", async () => {
    expect(await recusado(produto())).toBe(false);
  });

  it("recusa endereço (slug) fora do padrão", async () => {
    for (const slug of ["'Camisa Nova'", "'camisa_nova'", "'-camisa'", "'camisa-'", "'a'", `'${"a".repeat(61)}'`]) {
      expect(await recusado(produto({ slug })), slug).toBe(true);
    }
  });

  it("recusa categoria desconhecida e fundo de foto inválido", async () => {
    expect(await recusado(produto({ category: "'Outra'" }))).toBe(true);
    expect(await recusado(produto({ photo_bg: "'azul'" }))).toBe(true);
    expect(await recusado(produto({ photo_bg: "'dark'" }))).toBe(false);
  });

  it("recusa tamanhos e cores que não são uma lista de 1 a 12 itens", async () => {
    for (const lista of [`'[]'::jsonb`, `'"M"'::jsonb`, `'{"a":1}'::jsonb`, `'["1","2","3","4","5","6","7","8","9","10","11","12","13"]'::jsonb`]) {
      expect(await recusado(produto({ sizes: lista })), `tamanhos ${lista}`).toBe(true);
      expect(await recusado(produto({ colors: lista })), `cores ${lista}`).toBe(true);
    }
  });

  it("só aceita foto dentro de /products/", async () => {
    expect(await recusado(produto({ image: "'/products/foto.webp'" }))).toBe(false);
    for (const image of ["'https://x.com/a.png'", "'/outra/foto.webp'", "'/products/../segredo'"]) {
      expect(await recusado(produto({ slug: "'outra-camisa'", image })), image).toBe(true);
    }
  });

  it("recusa estoque e preço negativos", async () => {
    expect(await recusado("UPDATE products SET stock = -1 WHERE slug = 'camisa-mumia'")).toBe(true);
    expect(await recusado("UPDATE products SET price_cents = -1 WHERE slug = 'camisa-mumia'")).toBe(true);
  });
});

describe("regras do banco: pedidos", () => {
  it("recusa status que não existe", async () => {
    expect(await recusado("INSERT INTO orders (status, total_cents) VALUES ('sumiu', 100)")).toBe(true);
    expect(await recusado("INSERT INTO custom_orders (status, model, color, size, placement) VALUES ('sumiu', 'a', 'b', 'c', 'd')")).toBe(true);
    expect(await recusado("INSERT INTO orders (status, total_cents) VALUES ('pago', 100)")).toBe(false);
  });

  // Chave estrangeira: um item de pedido só pode apontar para uma peça que existe.
  it("recusa item de pedido de uma peça inexistente", async () => {
    const p = await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }]);
    expect(
      await recusado(`INSERT INTO order_items (order_id, product_slug, name, size, color, qty, unit_price_cents)
                      VALUES (${p.id}, 'nao-existe', 'X', 'M', 'Preta', 1, 100)`),
    ).toBe(true);
  });

  it("não deixa apagar uma peça que já tem pedido", async () => {
    await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }]);
    expect(await recusado("DELETE FROM products WHERE slug = 'oversized-gt3-rs'")).toBe(true);
    // Uma peça sem pedidos pode ser apagada.
    expect(await recusado("DELETE FROM products WHERE slug = 'camisa-mumia'")).toBe(false);
  });

  it("recusa quantidade fora de 1 a 99 no item do pedido", async () => {
    const p = await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }]);
    for (const qty of [0, -1, 100]) {
      expect(
        await recusado(`INSERT INTO order_items (order_id, product_slug, name, size, color, qty, unit_price_cents)
                        VALUES (${p.id}, 'oversized-gt3-rs', 'X', 'M', 'Preta', ${qty}, 100)`),
        String(qty),
      ).toBe(true);
    }
  });
});

describe("gatilho de updated_at", () => {
  // O gatilho atualiza a data sozinho, mesmo se quem altera "esquecer" de mexer nela.
  it("atualiza updated_at a cada alteração, sem o código pedir", async () => {
    const db = await getDb();
    await db.execute(sql.raw("UPDATE products SET updated_at = '2020-01-01' WHERE slug = 'camisa-mumia'"));
    // Altera outro campo, sem tocar em updated_at.
    await db.update(products).set({ stock: 3 }).where(eq(products.slug, "camisa-mumia"));
    const [row] = await db.select({ u: products.updatedAt }).from(products).where(eq(products.slug, "camisa-mumia"));
    expect(row.u.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("vale também para pedidos", async () => {
    const p = await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }]);
    const db = await getDb();
    await db.execute(sql.raw(`UPDATE orders SET updated_at = '2020-01-01' WHERE id = ${p.id}`));
    await db.execute(sql.raw(`UPDATE orders SET total_cents = total_cents WHERE id = ${p.id}`));
    const [row] = await db.select({ u: orders.updatedAt }).from(orders).where(eq(orders.id, p.id));
    expect(row.u.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("histórico de status", () => {
  const GT3 = { slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 };

  /** Lê o histórico de um pedido já no formato "de→para (origem)". */
  async function historico(id: number) {
    const db = await getDb();
    const linhas = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(orderStatusHistory.id);
    return linhas.map((h) => `${h.fromStatus ?? "início"}→${h.toStatus} (${h.origin})`);
  }

  it("registra a criação do pedido", async () => {
    const p = await createOrder([GT3]);
    expect(await historico(p.id)).toEqual(["início→pendente (pedido)"]);
  });

  it("registra cada mudança feita pelo painel", async () => {
    const p = await createOrder([GT3]);
    await updateOrderStatus(p.id, "pago");
    await updateOrderStatus(p.id, "enviado");
    expect(await historico(p.id)).toEqual(["início→pendente (pedido)", "pendente→pago (painel)", "pago→enviado (painel)"]);
  });

  it("registra o cancelamento pelo painel com o status de onde veio", async () => {
    const p = await createOrder([GT3]);
    await updateOrderStatus(p.id, "pago");
    await updateOrderStatus(p.id, "cancelado");
    expect((await historico(p.id)).at(-1)).toBe("pago→cancelado (painel)");
  });

  it("registra a expiração como 'prazo', e não como o painel", async () => {
    const p = await createOrder([GT3]);
    const db = await getDb();
    await db.update(orders).set({ createdAt: new Date(Date.now() - 100 * 3600_000) }).where(eq(orders.id, p.id));
    expect(await expirePendingOrders(48)).toBe(1);
    expect((await historico(p.id)).at(-1)).toBe("pendente→cancelado (expiracao)");
  });

  // Mudança recusada não pode deixar rastro no histórico.
  it("não registra mudanças recusadas", async () => {
    const p = await createOrder([GT3]);
    await updateOrderStatus(p.id, "enviado"); // pula o "pago": recusado
    expect(await historico(p.id)).toEqual(["início→pendente (pedido)"]);
  });

  it("três cancelamentos ao mesmo tempo geram uma linha só de histórico", async () => {
    const p = await createOrder([GT3]);
    await Promise.all([updateOrderStatus(p.id, "cancelado"), updateOrderStatus(p.id, "cancelado"), updateOrderStatus(p.id, "cancelado")]);
    expect((await historico(p.id)).filter((l) => l.includes("→cancelado"))).toHaveLength(1);
  });

  it("aparece na listagem do painel, da mais antiga para a mais recente", async () => {
    const p = await createOrder([GT3]);
    await updateOrderStatus(p.id, "pago");
    const [pedido] = await listOrders();
    expect(pedido.history.map((h) => h.toStatus)).toEqual(["pendente", "pago"]);
  });
});

describe("consistência dos pedidos", () => {
  // O total do pedido precisa ser exatamente a soma dos itens (preço congelado x quantidade).
  it("o total de cada pedido bate com a soma dos itens", async () => {
    await createOrder([{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 3 }, { slug: "camisa-mumia", size: "G", color: "Branca", qty: 2 }]);
    await createOrder([{ slug: "eu-faco-programa", size: "P", color: "Preta", qty: 1 }]);
    const db = await getDb();
    const todos = await db.select().from(orders);
    const itens = await db.select().from(orderItems);
    expect(todos).toHaveLength(2);
    for (const o of todos) {
      const soma = itens.filter((i) => i.orderId === o.id).reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
      expect(o.totalCents, `pedido ${o.id}`).toBe(soma);
    }
  });
});
