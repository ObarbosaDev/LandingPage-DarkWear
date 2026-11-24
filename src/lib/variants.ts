// ============================================================================
// Variações de uma peça (tamanho x cor): chaves e divisão do estoque.
//
// Quem usa: o catálogo (src/server/catalog.ts), a página da peça (ProductBuy), o painel de produtos e o
// cadastro inicial de exemplo. Fica em src/lib porque componentes de navegador também precisam disto.
// ============================================================================

/** A chave de uma variação, usada nos mapas de estoque e nos campos do painel: "M|Preta". */
export const chaveDaVariacao = (size: string, color: string) => `${size}|${color}`;

/** Estoque por variação: chave "tamanho|cor" -> quantidade. Variação ausente = 0. */
export type EstoquePorVariacao = Record<string, number>;

/** Quantas peças há de UMA combinação (0 se a combinação não existe). */
export function estoqueDaVariacao(estoque: EstoquePorVariacao, size: string, color: string): number {
  return estoque[chaveDaVariacao(size, color)] ?? 0;
}

/**
 * Divide um total pelas combinações de tamanho e cor, o mais igual possível: o que sobra da divisão vai uma
 * peça a mais para as primeiras (tamanhos na ordem, cores dentro de cada tamanho). A soma é sempre o total.
 * É a mesma conta que a migração 0010 faz no SQL para os produtos que já existiam.
 */
export function dividirEstoque(total: number, sizes: string[], colors: string[]): EstoquePorVariacao {
  const combos = sizes.flatMap((s) => colors.map((c) => chaveDaVariacao(s, c)));
  const out: EstoquePorVariacao = {};
  if (combos.length === 0) return out;
  const base = Math.floor(total / combos.length);
  const resto = total % combos.length;
  combos.forEach((k, i) => {
    out[k] = base + (i < resto ? 1 : 0);
  });
  return out;
}

/** Soma o estoque de todas as variações (é o "estoque total" da peça). */
export const somarEstoque = (estoque: EstoquePorVariacao) => Object.values(estoque).reduce((a, b) => a + b, 0);
