// ============================================================================
// Textos dos pedidos mostrados ao CLIENTE (telas /conta/pedidos e /conta/pedidos/[numero]).
// O banco guarda o status em código curto (pendente, pago...); aqui ele vira a palavra gigante da tela e
// os eventos do histórico viram frases. (O painel do dono tem os seus próprios rótulos, mais técnicos.)
// ============================================================================

import type { OrderStatus } from "@/server/db/schema";

// A palavra que representa cada status. Curta e sem espaços, porque aparece em letras enormes.
const PALAVRA: Record<OrderStatus, string> = {
  pendente: "Aguardando",
  pago: "Pago",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/** A palavra gigante de um status. Um status que ainda não conhecemos vira "—" em vez de quebrar a tela. */
export function palavraDoStatus(status: OrderStatus): string {
  return PALAVRA[status] ?? "—";
}

/**
 * A frase de uma linha do histórico do pedido ("Pagamento confirmado"), a partir do status de destino.
 * O status de origem só distingue o primeiro evento (de "nada" para pendente = o pedido foi feito).
 */
export function eventoDoPedido(de: OrderStatus | null, para: OrderStatus): string {
  if (de === null) return "Pedido feito";
  switch (para) {
    case "pago":
      return "Pagamento confirmado";
    case "enviado":
      return "Pedido enviado";
    case "entregue":
      return "Pedido entregue";
    case "cancelado":
      return "Pedido cancelado";
    default:
      return "Pedido atualizado";
  }
}
