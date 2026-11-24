// ============================================================================
// MEDIDOR DE ESTOQUE: a "pilha de camisetas" das prateleiras do painel. São 10 blocos; cada bloco cheio é uma
// peça em estoque (a partir de 10 peças a pilha fica toda cheia). Dá para ler o estoque sem ler o número.
// ============================================================================

/** Tamanho da pilha: 10 blocos. */
const TOTAL = 10;

export type MedidorDeEstoque = {
  /** Quantos blocos aparecem cheios (0 a 10). */
  cheios: number;
  /** Quantos blocos tem a pilha. */
  total: number;
  /** "vazio" (esgotado), "baixo" (1 a 3 peças: hora de repor) ou "ok". */
  nivel: "vazio" | "baixo" | "ok";
};

/** Calcula a pilha de um estoque. Valor inválido (negativo, decimal, texto) é tratado como esgotado. */
export function medidorDeEstoque(estoque: number): MedidorDeEstoque {
  if (typeof estoque !== "number" || !Number.isInteger(estoque) || estoque <= 0) return { cheios: 0, total: TOTAL, nivel: "vazio" };
  return { cheios: Math.min(estoque, TOTAL), total: TOTAL, nivel: estoque <= 3 ? "baixo" : "ok" };
}
