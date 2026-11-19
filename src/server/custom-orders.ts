// Encomenda com arte do cliente: validação da entrada e registro no banco.

import { getDb } from "@/server/db";
import { customOrders } from "@/server/db/schema";
import { COLORS, MODELS, PLACEMENTS, SIZES, isOneOf } from "@/lib/custom-order-options";

export type CustomOrderInput = {
  name: string;
  model: string;
  color: string;
  size: string;
  placement: string;
  notes?: string;
  fileName?: string;
};

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

  if (!isOneOf(MODELS, model)) return { ok: false, error: "Modelo inválido." };
  if (!isOneOf(SIZES, size)) return { ok: false, error: "Tamanho inválido." };
  if (!isOneOf(COLORS, color)) return { ok: false, error: "Escolha uma cor." };
  if (!isOneOf(PLACEMENTS.map((p) => p.id), placement)) return { ok: false, error: "Escolha onde a arte vai." };

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
