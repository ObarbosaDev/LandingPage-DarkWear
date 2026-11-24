// ============================================================================
// Código de rastreio de um pedido enviado.
//
// Quem usa: o painel (ao marcar "enviado"), a página do pedido do cliente e a ordem da esteira.
// Fica em src/lib porque as telas também precisam do link de acompanhamento.
// ============================================================================

/**
 * Limpa o que o dono digitou e devolve o código no formato guardado (maiúsculas, sem espaços, pontos nem
 * hífens), ou null se não for um código plausível (6 a 40 letras ou números). "AB 123.456-789 br" vira
 * "AB123456789BR". É a mesma regra que o banco confere (migração 0011).
 */
export function normalizarRastreio(bruto: string): string | null {
  const limpo = bruto.replace(/[\s.\-]/g, "").toUpperCase();
  return /^[A-Z0-9]{6,40}$/.test(limpo) ? limpo : null;
}

/**
 * O link para acompanhar o envio, ou null quando não sabemos qual transportadora é. Só códigos no formato dos
 * Correios (2 letras, 9 números e 2 letras, como AA123456789BR) ganham link; os demais mostram só o código.
 */
export function linkDeRastreio(codigo: string): string | null {
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(codigo)
    ? `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(codigo)}`
    : null;
}
