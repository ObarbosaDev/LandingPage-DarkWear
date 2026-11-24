// ============================================================================
// CUPONS e o desconto no Pix: ler, criar, ativar/desativar e conferir.
//
// Quem usa: o registro do pedido (src/server/orders.ts), a prévia da sacola (/api/cart/preview) e o painel de
// cupons (/admin/cupons). A CONTA dos descontos (puro, sem banco) fica em src/lib/discounts.ts.
//
// Um cupom nunca é apagado (os pedidos que o usaram apontam para ele): o dono o desativa.
// ============================================================================

import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { PIX_DESCONTO_MAXIMO, normalizarCodigoDoCupom, type Cupom } from "@/lib/discounts";
import { getDb } from "@/server/db";
import { coupons } from "@/server/db/schema";

/** O percentual do desconto no Pix que o dono configurou (PIX_DISCOUNT_PERCENT, inteiro de 1 a 30); 0 = sem desconto. */
export function pixDescontoPercent(): number {
  const bruto = process.env.PIX_DISCOUNT_PERCENT;
  if (typeof bruto !== "string" || !/^\d{1,3}$/.test(bruto.trim())) return 0;
  const n = Number(bruto);
  return n >= 1 ? Math.min(n, PIX_DESCONTO_MAXIMO) : 0;
}

type LinhaDeCupom = typeof coupons.$inferSelect;

/** A linha do banco no formato que o resto do código usa. */
export function comoCupom(r: LinhaDeCupom): Cupom {
  return {
    code: r.code,
    kind: r.kind as Cupom["kind"],
    value: r.value,
    minOrderCents: r.minOrderCents,
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    startsAt: r.startsAt,
    expiresAt: r.expiresAt,
    active: r.active,
  };
}

/** Os dados de um cupom novo, já validados (ver parseCouponForm). */
export type NovoCupom = {
  code: string;
  kind: "percent" | "fixed";
  /** Percentual (1 a 90) ou valor em centavos. */
  value: number;
  minOrderCents: number;
  maxUses: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
};

/**
 * Cria um cupom. O banco confere as regras de novo (percentual até 90, uso dentro do limite, datas em ordem).
 * @returns "ok" ou "existe" (já há um cupom com este código)
 */
export async function createCoupon(c: NovoCupom): Promise<"ok" | "existe"> {
  const db = await getDb();
  const feito = await db
    .insert(coupons)
    .values({
      code: c.code,
      kind: c.kind,
      value: c.value,
      minOrderCents: c.minOrderCents,
      maxUses: c.maxUses,
      startsAt: c.startsAt,
      expiresAt: c.expiresAt,
      active: c.active,
    })
    .onConflictDoNothing()
    .returning({ code: coupons.code });
  return feito.length > 0 ? "ok" : "existe";
}

/** Liga ou desliga um cupom. @returns false se o cupom não existe */
export async function setCouponActive(code: string, active: boolean): Promise<boolean> {
  const c = normalizarCodigoDoCupom(code);
  if (!c) return false;
  const db = await getDb();
  const feito = await db.update(coupons).set({ active }).where(eq(coupons.code, c)).returning({ code: coupons.code });
  return feito.length > 0;
}

/** Todos os cupons, os ativos primeiro e, dentro de cada grupo, os mais novos. */
export async function listCoupons(): Promise<Cupom[]> {
  const db = await getDb();
  const linhas = await db.select().from(coupons).orderBy(desc(coupons.active), desc(coupons.createdAt), asc(coupons.code));
  return linhas.map(comoCupom);
}

/** Um cupom pelo código (já normalizado ou não), ou null se não existe ou o código tem formato inválido. */
export async function getCoupon(code: string): Promise<Cupom | null> {
  const c = normalizarCodigoDoCupom(code);
  if (!c) return null;
  const db = await getDb();
  const [r] = await db.select().from(coupons).where(eq(coupons.code, c));
  return r ? comoCupom(r) : null;
}

/**
 * Lê o formulário de novo cupom do painel. Tudo é conferido aqui (a tela pode ser contornada).
 * Valor: em PERCENTUAL (inteiro de 1 a 90) ou em REAIS ("15" ou "15,50"), conforme o tipo.
 * Datas: campos "AAAA-MM-DD" (vazio = sem data); o vencimento vale até o FIM do dia escolhido, no horário de Brasília.
 */
export function parseCouponForm(form: FormData): { ok: true; data: NovoCupom } | { ok: false; error: string } {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const code = normalizarCodigoDoCupom(get("code"));
  if (!code) return { ok: false, error: "Código inválido: use de 3 a 30 letras, números, hífen ou _ (sem espaços)." };

  const kind = get("kind");
  if (kind !== "percent" && kind !== "fixed") return { ok: false, error: "Escolha o tipo do desconto." };

  let value: number;
  if (kind === "percent") {
    if (!/^\d{1,2}$/.test(get("value"))) return { ok: false, error: "Percentual inválido: use um número inteiro de 1 a 90." };
    value = Number(get("value"));
    if (value < 1 || value > 90) return { ok: false, error: "Percentual inválido: use um número inteiro de 1 a 90." };
  } else {
    const reais = reaisParaCentavos(get("value"));
    if (reais === null || reais < 1 || reais > 1_000_000) return { ok: false, error: "Valor inválido. Exemplo: 15 ou 15,50 (até R$ 10.000)." };
    value = reais;
  }

  const minimo = get("min") === "" ? 0 : reaisParaCentavos(get("min"));
  if (minimo === null || minimo > 100_000_000) return { ok: false, error: "Pedido mínimo inválido. Exemplo: 150 ou 150,00." };

  let maxUses: number | null = null;
  if (get("maxUses") !== "") {
    if (!/^\d{1,7}$/.test(get("maxUses")) || Number(get("maxUses")) < 1) return { ok: false, error: "Limite de usos inválido: use um número inteiro de 1 ou mais, ou deixe vazio." };
    maxUses = Number(get("maxUses"));
  }

  const inicio = lerDia(get("startsAt"), "inicio");
  const fim = lerDia(get("expiresAt"), "fim");
  if (inicio === "invalido" || fim === "invalido") return { ok: false, error: "Data inválida: use o formato AAAA-MM-DD." };
  if (inicio && fim && inicio >= fim) return { ok: false, error: "A data de vencimento precisa ser depois da data de início." };

  return {
    ok: true,
    data: { code, kind, value, minOrderCents: minimo, maxUses, startsAt: inicio, expiresAt: fim, active: form.get("active") === "on" },
  };
}

/** "15", "15,5", "1.250,90" → centavos inteiros, ou null se não for dinheiro. */
function reaisParaCentavos(bruto: string): number | null {
  const s = bruto.trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [inteiro, centavos = ""] = s.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(centavos.padEnd(2, "0"));
}

/** "2026-12-31" → o começo ou o fim desse dia no horário de Brasília (UTC-3), ou null se vazio, ou "invalido". */
function lerDia(bruto: string, ponta: "inicio" | "fim"): Date | null | "invalido" {
  if (bruto === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
  if (!m) return "invalido";
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // 2026-02-31 viraria 3 de março: recusa datas que não existem.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "invalido";
  // Brasília = UTC-3: meia-noite de lá é 03:00 UTC. O fim do dia é o começo do dia seguinte (o vencimento é exclusivo).
  return new Date(Date.UTC(ano, mes - 1, dia + (ponta === "fim" ? 1 : 0), 3, 0, 0));
}
