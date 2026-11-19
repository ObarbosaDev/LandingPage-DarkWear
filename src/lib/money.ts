// ============================================================================
// Dinheiro: guardamos SEMPRE em centavos inteiros (8990 = R$ 89,90) e só convertemos em texto na
// hora de mostrar.
//
// Por que centavos: números com vírgula no computador têm erro de arredondamento (89,90 x 3 dá
// 269,70000000000005). Inteiros não têm esse problema, então somar e multiplicar é sempre exato.
//
// Quem usa: todas as telas que mostram preço (loja, produto, sacola, painel) e as mensagens do WhatsApp.
// ============================================================================

// Dinheiro sempre em centavos inteiros; só vira texto na hora de mostrar.

/**
 * Formata centavos como real brasileiro. Ex.: 8990 → "R$ 89,90", 129900 → "R$ 1.299,00".
 * (O espaço entre "R$" e o número é um espaço especial que não quebra a linha.)
 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
