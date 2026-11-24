// ============================================================================
// Tempo RELATIVO em português ("há 5 min", "há 2 dias"): usado no painel para mostrar há quanto tempo um
// pedido ou uma conta existe, sem a pessoa precisar fazer a conta de cabeça com uma data completa.
// ============================================================================

/**
 * Há quanto tempo uma data aconteceu, em texto curto. Data no futuro (relógio do servidor diferente do do
 * banco) vira "agora", nunca um número negativo; data inválida ou tipo errado vira "—" (não quebra a tela).
 *
 * @param agora o "agora" em milissegundos (parâmetro só para os testes)
 */
export function tempoRelativo(data: Date, agora: number = Date.now()): string {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return "—";
  const ms = agora - data.getTime();
  if (ms < 60_000) return "agora";

  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(ms / 86_400_000);
  if (dias < 7) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  // Até 34 dias conta em semanas (30 dias = "4 semanas", que é como a pessoa fala); depois, em meses e anos.
  if (dias < 35) {
    const semanas = Math.floor(dias / 7);
    return `há ${semanas} ${semanas === 1 ? "semana" : "semanas"}`;
  }
  if (dias < 365) {
    const meses = Math.floor(dias / 30);
    return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  }
  const anos = Math.floor(dias / 365);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}
