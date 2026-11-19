// Regras de pedido, com persistência em banco e estoque protegido por transação.

import "server-only";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderItems, orders, products, type OrderStatus } from "@/server/db/schema";

export type OrderItemInput = { slug: string; size: string; color: string; qty: number };

export type OrderView = {
  id: number;
  number: string; // "DW-00042"
  status: OrderStatus;
  totalCents: number;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
};

export const orderNumber = (id: number) => `DW-${String(id).padStart(5, "0")}`;

export class OrderError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

// ---------- Pedido de peças prontas ----------

function parseItems(input: unknown): OrderItemInput[] {
  if (!Array.isArray(input) || input.length === 0) throw new OrderError("Carrinho vazio.");
  if (input.length > 50) throw new OrderError("Carrinho muito grande.");

  // Junta linhas repetidas (mesma peça, tamanho e cor) para o estoque ser conferido pela soma.
  const merged = new Map<string, OrderItemInput>();
  for (const raw of input) {
    const r = (raw ?? {}) as Partial<OrderItemInput>;
    const qty = Number(r.qty);
    if (typeof r.slug !== "string" || typeof r.size !== "string" || typeof r.color !== "string")
      throw new OrderError("Item inválido no carrinho.");
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new OrderError("Quantidade inválida.");
    const key = `${r.slug}|${r.size}|${r.color}`;
    const prev = merged.get(key);
    if (prev) prev.qty += qty;
    else merged.set(key, { slug: r.slug, size: r.size, color: r.color, qty });
  }
  return [...merged.values()];
}

export async function createOrder(input: unknown): Promise<OrderView> {
  const lines = parseItems(input);
  const db = await getDb();

  return db.transaction(async (tx) => {
    let total = 0;
    const resolved: OrderView["items"] = [];

    // Baixa em ordem alfabética de produto: dois pedidos com os mesmos itens em ordens diferentes
    // travam as linhas na mesma sequência e não entram em deadlock. A ordem original é mantida na resposta.
    const byIndex = lines.map((l, i) => ({ l, i })).sort((a, b) => (a.l.slug < b.l.slug ? -1 : a.l.slug > b.l.slug ? 1 : 0));

    for (const { l, i } of byIndex) {
      const [p] = await tx.select().from(products).where(eq(products.slug, l.slug));
      if (!p || !p.active) throw new OrderError("Produto indisponível.");
      if (!p.sizes.includes(l.size)) throw new OrderError(`Tamanho inválido para ${p.name}.`);
      if (!p.colors.includes(l.color)) throw new OrderError(`Cor inválida para ${p.name}.`);

      // Baixa o estoque em um único UPDATE condicional: se não houver quantidade, nenhuma linha muda.
      const updated = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${l.qty}`, updatedAt: new Date() })
        .where(and(eq(products.slug, l.slug), eq(products.active, true), gte(products.stock, l.qty)))
        .returning({ name: products.name, priceCents: products.priceCents });

      if (updated.length === 0) throw new OrderError(`Estoque insuficiente para ${p.name}.`, 409);

      const { name, priceCents } = updated[0];
      total += priceCents * l.qty;
      resolved[i] = { name, size: l.size, color: l.color, qty: l.qty, unitPriceCents: priceCents };
    }

    const [order] = await tx
      .insert(orders)
      .values({ totalCents: total })
      .returning({ id: orders.id, status: orders.status });

    await tx.insert(orderItems).values(
      lines.map((l, i) => ({
        orderId: order.id,
        productSlug: l.slug,
        name: resolved[i].name,
        size: l.size,
        color: l.color,
        qty: l.qty,
        unitPriceCents: resolved[i].unitPriceCents,
      })),
    );

    return { id: order.id, number: orderNumber(order.id), status: order.status, totalCents: total, items: resolved };
  });
}

// Cancela o pedido e devolve as peças ao estoque. Fica pronto para o painel do dono.
export async function cancelOrder(id: number): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Só quem de fato muda o status para "cancelado" devolve as peças: o UPDATE condicional trava a
    // linha, então um segundo cancelamento simultâneo não encontra nada para alterar e sai sem repor.
    const changed = await tx
      .update(orders)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(and(eq(orders.id, id), ne(orders.status, "cancelado")))
      .returning({ id: orders.id });
    if (changed.length === 0) return false;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    for (const it of items) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${it.qty}`, updatedAt: new Date() })
        .where(eq(products.slug, it.productSlug));
    }
    return true;
  });
}
