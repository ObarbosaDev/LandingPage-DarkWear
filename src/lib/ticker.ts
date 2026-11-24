// ============================================================================
// Texto da FAIXA do painel: a linha que corre no topo de todas as telas de /admin, como o letreiro de uma loja
// ou o ticker de uma bolsa. Mostra, de relance, o que está esperando pelo dono.
// ============================================================================

export type NumerosDaFaixa = {
  pedidosPendentes: number;
  encomendasNovas: number;
  pedidosHoje: number;
  pagamentosParaConferir: number;
};

// Um número válido para mostrar: inteiro e positivo. Qualquer outra coisa (negativo, decimal, NaN, ausente) é zero.
const n = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

/** "1 pedido" / "3 pedidos": o singular quando é um só. */
const plural = (qtd: number, um: string, varios: string) => `${qtd} ${qtd === 1 ? um : varios}`;

/**
 * As frases da faixa, da mais urgente para a menos. Só aparece o que tem número; se não há nada esperando,
 * uma frase só diz que está tudo em dia (a faixa nunca fica vazia).
 */
export function itensDaFaixa(c: NumerosDaFaixa): string[] {
  const itens: string[] = [];
  const conferir = n(c.pagamentosParaConferir);
  if (conferir > 0) itens.push(`Atenção: ${conferir} ${conferir === 1 ? "pagamento" : "pagamentos"} para conferir`);
  const pendentes = n(c.pedidosPendentes);
  if (pendentes > 0) itens.push(`${plural(pendentes, "pedido", "pedidos")} esperando pagamento`);
  const novas = n(c.encomendasNovas);
  if (novas > 0) itens.push(`${novas} ${novas === 1 ? "encomenda nova" : "encomendas novas"}`);
  const hoje = n(c.pedidosHoje);
  if (hoje > 0) itens.push(`${plural(hoje, "pedido", "pedidos")} hoje`);
  return itens.length ? itens : ["Tudo em dia: nada esperando por você"];
}
