// Regras de pedido, com persistência em banco e estoque protegido por transação.

import { and, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customOrders, orderItems, orders, products, type OrderStatus } from "@/db/schema";

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

    for (const l of lines) {
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
      resolved.push({ name, size: l.size, color: l.color, qty: l.qty, unitPriceCents: priceCents });
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

// ---------- Encomenda personalizada ----------

export type CustomOrderInput = {
  name: string;
  model: string;
  color: string;
  size: string;
  placement: string;
  notes?: string;
  fileName?: string;
};

const MODELS = ["Camiseta", "Moletom", "Oversized"] as const;
const SIZES = ["P", "M", "G", "GG", "XG"] as const;
const PLACEMENT_IDS = ["peito", "frente", "costas", "manga"] as const;

export function validateCustom(
  input: unknown,
): { ok: true; order: CustomOrderInput } | { ok: false; error: string } {
  const r = (input ?? {}) as Partial<CustomOrderInput>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const model = str(r.model, 30);
  const color = str(r.color, 30);
  const size = str(r.size, 5);
  const name = str(r.name, 60);
  const notes = str(r.notes, 500);
  const fileName = str(r.fileName, 120);
  const placement = str(r.placement, 20);

  if (!(MODELS as readonly string[]).includes(model)) return { ok: false, error: "Modelo inválido." };
  if (!(SIZES as readonly string[]).includes(size)) return { ok: false, error: "Tamanho inválido." };
  if (!color) return { ok: false, error: "Escolha uma cor." };
  if (!(PLACEMENT_IDS as readonly string[]).includes(placement))
    return { ok: false, error: "Escolha onde a arte vai." };

  return { ok: true, order: { name, model, color, size, placement, notes, fileName: fileName || undefined } };
}

export async function saveCustomOrder(o: CustomOrderInput): Promise<{ id: number; number: string }> {
  const db = await getDb();
  const [row] = await db
    .insert(customOrders)
    .values({
      name: o.name,
      model: o.model,
      color: o.color,
      size: o.size,
      placement: o.placement,
      notes: o.notes ?? "",
      fileName: o.fileName ?? null,
    })
    .returning({ id: customOrders.id });
  return { id: row.id, number: `EP-${String(row.id).padStart(5, "0")}` };
}
