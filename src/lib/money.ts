// Dinheiro sempre em centavos inteiros; só vira texto na hora de mostrar.

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
