// ============================================================================
// Encomenda com a arte do cliente: validação da entrada e registro no banco.
//
// Quem usa: POST /api/custom-orders (src/app/api/custom-orders/route.ts), chamado pela tela
// /personalizar quando o cliente clica em "Finalizar pelo WhatsApp".
//
// Diferente do pedido de peça pronta, aqui não há estoque nem preço: é um pedido de orçamento. O
// arquivo da arte NÃO passa pelo site (o cliente o anexa na conversa do WhatsApp); guardamos só o
// nome dele, para o dono saber o que esperar. O dono acompanha tudo em /admin/encomendas.
// ============================================================================

import "server-only";
import { getDb } from "@/server/db";
import { customOrders } from "@/server/db/schema";
// As opções válidas vivem num arquivo só, compartilhado com a tela, para os dois lados concordarem.
import { COLORS, MODELS, PLACEMENTS, SIZES, isOneOf } from "@/lib/custom-order-options";

/** Os dados da encomenda, já limpos e validados. */
export type CustomOrderInput = {
  name: string;
  model: string;
  color: string;
  size: string;
  placement: string;
  notes?: string;
  fileName?: string;
};

/**
 * Confere o que o navegador enviou e devolve uma encomenda limpa, ou o motivo da recusa.
 * Nunca lança erro: devolve { ok: false, error } com a mensagem a mostrar ao cliente.
 *
 * @param input corpo da requisição, ainda não confiável (pode ser qualquer coisa)
 */
export function validateCustom(
  input: unknown,
): { ok: true; order: CustomOrderInput } | { ok: false; error: string } {
  // "input ?? {}" evita erro quando vem null/undefined; os campos errados viram texto vazio abaixo.
  const r = (input ?? {}) as Partial<CustomOrderInput>;
  // Pega só texto, tira espaços das pontas e corta no tamanho máximo (qualquer outro tipo vira "").
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const model = str(r.model, 30);
  const color = str(r.color, 30);
  const size = str(r.size, 5);
  const name = str(r.name, 60);
  const notes = str(r.notes, 500);
  const fileName = str(r.fileName, 120);
  const placement = str(r.placement, 20);

  // Modelo, tamanho, cor e posição só valem se estiverem nas listas oferecidas na tela.
  if (!isOneOf(MODELS, model)) return { ok: false, error: "Modelo inválido." };
  if (!isOneOf(SIZES, size)) return { ok: false, error: "Tamanho inválido." };
  if (!isOneOf(COLORS, color)) return { ok: false, error: "Escolha uma cor." };
  if (!isOneOf(PLACEMENTS.map((p) => p.id), placement)) return { ok: false, error: "Escolha onde a arte vai." };

  // fileName vazio vira undefined (campo opcional ausente), e não uma string vazia.
  return { ok: true, order: { name, model, color, size, placement, notes, fileName: fileName || undefined } };
}

/**
 * Grava a encomenda (já validada) e devolve o número dela.
 *
 * @returns id interno e o número mostrado ao cliente ("EP-00042", de "encomenda personalizada")
 */
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
