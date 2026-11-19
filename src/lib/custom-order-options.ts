// Opções da encomenda personalizada. A tela e a validação do servidor leem daqui,
// para uma opção nunca existir de um lado e ser recusada do outro.

export const MODELS = ["Camiseta", "Moletom", "Oversized"] as const;
export const SIZES = ["P", "M", "G", "GG", "XG"] as const;
export const COLORS = ["Preta", "Off-white", "Cinza chumbo"] as const;

export const PLACEMENTS = [
  { id: "peito", label: "Peito", note: "Logo pequeno, do lado esquerdo" },
  { id: "frente", label: "Frente", note: "Arte grande no centro do peito" },
  { id: "costas", label: "Costas", note: "Arte grande nas costas" },
  { id: "manga", label: "Manga", note: "Detalhe na manga" },
] as const;

export type PlacementId = (typeof PLACEMENTS)[number]["id"];

export const isOneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);
