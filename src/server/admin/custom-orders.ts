// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customOrders } from "@/server/db/schema";

export const CUSTOM_STATUS = ["novo", "em contato", "produzindo", "concluído", "cancelado"] as const;
export type CustomStatus = (typeof CUSTOM_STATUS)[number];

export async function listCustomOrders(limit = 100) {
  const db = await getDb();
  return db.select().from(customOrders).orderBy(desc(customOrders.createdAt)).limit(limit);
}

export async function setCustomStatus(id: number, status: string): Promise<boolean> {
  if (!(CUSTOM_STATUS as readonly string[]).includes(status)) return false;
  const db = await getDb();
  const done = await db.update(customOrders).set({ status }).where(eq(customOrders.id, id)).returning({ id: customOrders.id });
  return done.length > 0;
}
