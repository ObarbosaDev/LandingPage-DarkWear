// ============================================================================
// A CONTA DOS DESCONTOS: cupom e desconto no Pix. Tudo em centavos inteiros, sem arredondar a favor do cliente.
//
// Quem usa: o registro do pedido (src/server/orders.ts), a prévia da sacola (/api/cart/preview), o painel de cupons
// e a mensagem do WhatsApp. É puro (sem banco): o MESMO cálculo vale na prévia e no pedido de verdade, então o valor
// que o cliente vê na sacola é o que o servidor cobra.
//
// Regras:
//   - o cupom desconta sobre o subtotal; o desconto do Pix desconta sobre o valor JÁ com o cupom;
//   - percentuais arredondam para BAIXO (o desconto nunca ganha um centavo a mais);
//   - o total nunca fica abaixo de TOTAL_MINIMO_CENTS (um pedido de R$ 0 não pode ser cobrado);
//   - desconto do Pix: o dono escolhe o percentual (PIX_DISCOUNT_PERCENT); o teto aqui é PIX_DESCONTO_MAXIMO.
// ============================================================================

import { formatCents } from "@/lib/money";

/** Nenhum pedido é cobrado por menos que isto (R$ 1,00), mesmo com todos os descontos. */
export const TOTAL_MINIMO_CENTS = 100;

/** O maior desconto de Pix aceito, em %: valores maiores configurados por engano são limitados a este. */
export const PIX_DESCONTO_MAXIMO = 30;

/** Um cupom, como o código o enxerga (a linha do banco já convertida). */
export type Cupom = {
  code: string;
  /** "percent" = value é uma porcentagem (1 a 90); "fixed" = value é um valor em centavos. */
  kind: "percent" | "fixed";
  value: number;
  /** Subtotal mínimo do pedido para o cupom valer (0 = sem mínimo). */
  minOrderCents: number;
  /** Quantos usos no total (null = sem limite) e quantos já foram usados. */
  maxUses: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
};

/**
 * O código como o cliente digitou → o código guardado (maiúsculas, 3 a 30 letras, números, "_" ou "-"; começa com
 * letra ou número), ou null se o formato é inválido. Nada de espaços no meio, acentos ou símbolos.
 */
export function normalizarCodigoDoCupom(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const c = bruto.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(c) ? c : null;
}

/** Os valores de um pedido depois dos descontos. A soma dos três é sempre o subtotal. */
export type Descontos = { couponCents: number; pixCents: number; totalCents: number };

/**
 * Calcula os descontos de um pedido.
 * @param subtotalCents soma das peças, em centavos
 * @param cupom         o cupom (já conferido com motivoDeRecusa), ou ausente
 * @param pixPercent    percentual do desconto do Pix (0 ou ausente = sem Pix); inválido vira 0, acima do teto é limitado
 */
export function calcularDescontos(d: { subtotalCents: number; cupom?: Cupom | null; pixPercent?: number }): Descontos {
  const subtotal = d.subtotalCents;
  // O que se pode descontar no máximo: tudo o que passa do total mínimo.
  const folga = Math.max(0, subtotal - TOTAL_MINIMO_CENTS);

  let couponCents = 0;
  if (d.cupom) {
    const bruto = d.cupom.kind === "percent" ? Math.floor((subtotal * d.cupom.value) / 100) : d.cupom.value;
    couponCents = Math.max(0, Math.min(bruto, folga));
  }

  let pixCents = 0;
  const p = d.pixPercent;
  if (typeof p === "number" && Number.isInteger(p) && p > 0) {
    const percentual = Math.min(p, PIX_DESCONTO_MAXIMO);
    pixCents = Math.min(Math.floor(((subtotal - couponCents) * percentual) / 100), folga - couponCents);
    pixCents = Math.max(0, pixCents);
  }

  return { couponCents, pixCents, totalCents: subtotal - couponCents - pixCents };
}

/**
 * Por que um cupom NÃO vale agora (texto para mostrar ao cliente), ou null se vale.
 * @param subtotalCents o subtotal do pedido (para conferir o pedido mínimo)
 * @param agora         o "agora" (parâmetro só para os testes)
 */
export function motivoDeRecusa(c: Cupom, subtotalCents: number, agora: Date = new Date()): string | null {
  if (!c.active) return "Este cupom não está ativo.";
  if (c.startsAt && agora < c.startsAt) return "Este cupom ainda não começou.";
  if (c.expiresAt && agora >= c.expiresAt) return "Este cupom venceu.";
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return "Este cupom esgotou.";
  if (subtotalCents <= TOTAL_MINIMO_CENTS) return "O pedido é pequeno demais para usar um cupom.";
  if (subtotalCents < c.minOrderCents) return `Este cupom vale a partir de ${formatCents(c.minOrderCents)} em peças.`;
  return null;
}

/** A situação de um cupom para o painel: o que está acontecendo com ele agora. */
export type SituacaoDoCupom = "ativo" | "desativado" | "agendado" | "vencido" | "esgotado";

/** Resume a situação do cupom em uma palavra (a ordem importa: desativado manda mais que as datas). */
export function situacaoDoCupom(c: Cupom, agora: Date = new Date()): SituacaoDoCupom {
  if (!c.active) return "desativado";
  if (c.expiresAt && agora >= c.expiresAt) return "vencido";
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return "esgotado";
  if (c.startsAt && agora < c.startsAt) return "agendado";
  return "ativo";
}

/** O texto curto do desconto: "10% OFF" ou "R$ 15,00 OFF". */
export function rotuloDoDesconto(c: Pick<Cupom, "kind" | "value">): string {
  return c.kind === "percent" ? `${c.value}% OFF` : `${formatCents(c.value)} OFF`;
}
