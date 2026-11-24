// ============================================================================
// SAUDAÇÃO do painel ("Bom dia", "Boa tarde"...), pelo horário de SÃO PAULO e não pelo do servidor (que pode
// estar em outro fuso: a Vercel roda em UTC, e "Bom dia" às 3 da tarde seria estranho).
// ============================================================================

/** O cumprimento certo para o horário da data informada. Data inválida vira um "Olá" neutro. */
export function saudacao(data: Date = new Date()): string {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return "Olá";
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(data));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  if (hora >= 18) return "Boa noite";
  return "Boa madrugada";
}
