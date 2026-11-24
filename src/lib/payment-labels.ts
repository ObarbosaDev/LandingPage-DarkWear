// ============================================================================
// Textos legíveis do pagamento online, para o painel do dono.
// O Mercado Pago informa a forma de pagamento por códigos (credit_card, bank_transfer...) e o nosso
// banco guarda o status em código curto (aprovado, recusado...). Aqui viram português.
// Quem usa: /admin/pedidos.
// ============================================================================

/** Forma de pagamento como o Mercado Pago informa → texto. Código desconhecido aparece como veio. */
export function methodLabel(method: string | null): string {
  switch (method) {
    case "credit_card":
      return "cartão de crédito";
    case "debit_card":
      return "cartão de débito";
    case "prepaid_card":
      return "cartão pré-pago";
    case "bank_transfer":
      return "Pix";
    case "account_money":
      return "saldo Mercado Pago";
    case "ticket":
      return "boleto";
    case null:
      return "forma não informada";
    default:
      return method;
  }
}

/** "à vista" ou "3x", só faz sentido para cartão de crédito. */
export function installmentsLabel(method: string | null, installments: number | null): string | null {
  if (method !== "credit_card" || !installments) return null;
  return installments === 1 ? "à vista" : `${installments}x`;
}
