// ============================================================================
// Agrupamento por INICIAL: usado na "caderneta" de clientes do painel (a lista vira uma agenda: A, B, C...).
// ============================================================================

/** Um grupo da caderneta: a letra e os itens que começam com ela. */
export type GrupoDeInicial<T> = { letra: string; itens: T[] };

/** A letra de um nome: sem acento, maiúscula; qualquer coisa que não seja letra de A a Z vira "#". */
function inicial(nome: string): string {
  const primeira = String(nome ?? "")
    .trim()
    .charAt(0)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
  return /^[A-Z]$/.test(primeira) ? primeira : "#";
}

/**
 * Agrupa itens (que têm "name") pela inicial do nome: grupos de A a Z e, por último, o "#" (nomes que não
 * começam com letra). Acento e maiúscula não separam a mesma letra ("Álvaro" e "alice" ficam no "A"). Dentro de
 * cada grupo os nomes saem em ordem alfabética do português. Não perde nem repete nenhum item.
 */
export function agruparPorInicial<T extends { name: string }>(itens: T[]): GrupoDeInicial<T>[] {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const letra = inicial(item.name);
    mapa.set(letra, [...(mapa.get(letra) ?? []), item]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([letra, lista]) => ({ letra, itens: lista.sort((x, y) => x.name.localeCompare(y.name, "pt-BR", { sensitivity: "base" })) }));
}
