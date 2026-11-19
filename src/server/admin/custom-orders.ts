// ============================================================================
// Encomendas personalizadas vistas pelo DONO: listar e mudar o andamento.
//
// Quem usa: a tela /admin/encomendas e a ação changeCustomStatusAction (src/app/admin/actions.ts).
// A criação da encomenda (cliente, em /personalizar) fica em src/server/custom-orders.ts.
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customOrders } from "@/server/db/schema";

// Andamento de uma encomenda. Ao contrário do pedido de peça pronta, aqui o dono pode escolher
// QUALQUER status (o atendimento por WhatsApp não é linear: o cliente some, volta, muda de ideia).
export const CUSTOM_STATUS = ["novo", "em contato", "produzindo", "concluído", "cancelado"] as const;
export type CustomStatus = (typeof CUSTOM_STATUS)[number];

/** Lista as encomendas, da mais nova para a mais antiga. */
export async function listCustomOrders(limit = 100) {
  const db = await getDb();
  return db.select().from(customOrders).orderBy(desc(customOrders.createdAt)).limit(limit);
}

/**
 * Muda o andamento de uma encomenda.
 * @returns true se mudou; false se o status não existe ou a encomenda não foi encontrada
 */
export async function setCustomStatus(id: number, status: string): Promise<boolean> {
  // O texto vem de um formulário, então conferimos que é um dos status oferecidos.
  if (!(CUSTOM_STATUS as readonly string[]).includes(status)) return false;
  const db = await getDb();
  const done = await db.update(customOrders).set({ status }).where(eq(customOrders.id, id)).returning({ id: customOrders.id });
  return done.length > 0;
}
