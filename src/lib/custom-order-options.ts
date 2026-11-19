// ============================================================================
// Opções da encomenda personalizada (modelo, tamanho, cor e posição da arte).
//
// Quem usa:
//   - a tela /personalizar, para desenhar os botões de escolha;
//   - o servidor (src/server/custom-orders.ts), para validar o que chega.
// Ficam num arquivo só, compartilhado, de propósito: se o dono quiser oferecer um modelo novo,
// muda aqui e a tela e a validação passam a concordar. Antes, a lista existia em dois lugares e
// podia ficar diferente (a tela oferecer uma opção que o servidor recusava).
// ============================================================================

// "as const" faz o TypeScript tratar cada lista como valores fixos (e não como "texto qualquer"),
// o que permite derivar tipos exatos a partir delas.
export const MODELS = ["Camiseta", "Moletom", "Oversized"] as const;
export const SIZES = ["P", "M", "G", "GG", "XG"] as const;
export const COLORS = ["Preta", "Off-white", "Cinza chumbo"] as const;

// Onde a arte pode ser estampada. "id" é o código guardado no banco; "label" e "note" são os
// textos mostrados no botão grande da tela /personalizar.
export const PLACEMENTS = [
  { id: "peito", label: "Peito", note: "Logo pequeno, do lado esquerdo" },
  { id: "frente", label: "Frente", note: "Arte grande no centro do peito" },
  { id: "costas", label: "Costas", note: "Arte grande nas costas" },
  { id: "manga", label: "Manga", note: "Detalhe na manga" },
] as const;

// Um dos códigos de posição ("peito" | "frente" | "costas" | "manga"), derivado da lista acima.
export type PlacementId = (typeof PLACEMENTS)[number]["id"];

/**
 * Diz se um texto é um dos valores permitidos de uma lista.
 * O "value is T" avisa o TypeScript de que, se der true, o valor passa a ser tratado como um dos
 * itens da lista (e não mais como texto qualquer).
 */
export const isOneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);
