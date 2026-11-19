// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { orderItems, orders, ORDER_STATUS, type OrderStatus } from "@/server/db/schema";
import { cancelOrder, orderNumber } from "@/server/orders";

// De cada status, para quais o dono pode mover o pedido.
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pendente: ["pago", "cancelado"],
  pago: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: [],
  cancelado: [],
};

export type AdminOrder = {
  id: number;
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
};

export async function listOrders(status?: OrderStatus, limit = 100): Promise<AdminOrder[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));

  return rows.map((o) => ({
    id: o.id,
    number: orderNumber(o.id),
    status: o.status,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ name: i.name, size: i.size, color: i.color, qty: i.qty, unitPriceCents: i.unitPriceCents })),
  }));
}

export type StatusResult = "ok" | "invalido" | "nao-encontrado";

export async function updateOrderStatus(id: number, next: OrderStatus): Promise<StatusResult> {
  if (!ORDER_STATUS.includes(next)) return "invalido";
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) return "nao-encontrado";
  if (!NEXT_STATUS[o.status].includes(next)) return "invalido";

  // Cancelar devolve as peças ao estoque, tudo na mesma transação.
  if (next === "cancelado") return (await cancelOrder(id)) ? "ok" : "invalido";

  // Só muda se o status ainda for o que o dono viu (evita duas pessoas mudando ao mesmo tempo).
  const changed = await db
    .update(orders)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.status, o.status)))
    .returning({ id: orders.id });
  return changed.length ? "ok" : "invalido";
}
