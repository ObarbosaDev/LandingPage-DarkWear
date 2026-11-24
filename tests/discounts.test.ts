// ============================================================================
// Testes da CONTA DOS DESCONTOS (src/lib/discounts.ts): cupom e desconto no Pix, sempre em centavos inteiros.
// Por que testar: é dinheiro. O total nunca pode ficar negativo, zerado nem ter centavos "quebrados", e o cupom
// só vale dentro das regras (pedido mínimo, validade, limite de usos, ativo).
// ============================================================================

import { describe, expect, it } from "vitest";
import { PIX_DESCONTO_MAXIMO, TOTAL_MINIMO_CENTS, calcularDescontos, normalizarCodigoDoCupom, motivoDeRecusa, type Cupom } from "@/lib/discounts";

const agora = new Date("2026-06-15T12:00:00Z");
const cupom = (o: Partial<Cupom> = {}): Cupom => ({
  code: "BEMVINDO10",
  kind: "percent",
  value: 10,
  minOrderCents: 0,
  maxUses: null,
  usedCount: 0,
  startsAt: null,
  expiresAt: null,
  active: true,
  ...o,
});

describe("normalizarCodigoDoCupom", () => {
  it("põe em maiúsculas e tira espaços das pontas", () => {
    expect(normalizarCodigoDoCupom("  bemvindo10 ")).toBe("BEMVINDO10");
  });
  it("recusa formato inválido (curto, longo, símbolos, espaço no meio)", () => {
    for (const ruim of ["", "AB", "A".repeat(31), "BEM VINDO", "CUPOM!", "ÁGUA10", "-ABC", "<b>x</b>"]) {
      expect(normalizarCodigoDoCupom(ruim), ruim).toBeNull();
    }
    expect(normalizarCodigoDoCupom("promo_2026-A")).toBe("PROMO_2026-A");
  });
  it("não aceita o que não é texto", () => {
    expect(normalizarCodigoDoCupom(undefined as unknown as string)).toBeNull();
    expect(normalizarCodigoDoCupom(123 as unknown as string)).toBeNull();
  });
});

describe("calcularDescontos", () => {
  it("sem cupom e sem Pix o total é o subtotal", () => {
    expect(calcularDescontos({ subtotalCents: 17980 })).toEqual({ couponCents: 0, pixCents: 0, totalCents: 17980 });
  });

  it("cupom percentual arredonda PARA BAIXO (nunca dá centavo a mais)", () => {
    // 10% de 8999 = 899,9 → 899
    expect(calcularDescontos({ subtotalCents: 8999, cupom: cupom() })).toEqual({ couponCents: 899, pixCents: 0, totalCents: 8100 });
  });

  it("cupom de valor fixo desconta o valor", () => {
    expect(calcularDescontos({ subtotalCents: 20000, cupom: cupom({ kind: "fixed", value: 1500 }) })).toMatchObject({ couponCents: 1500, totalCents: 18500 });
  });

  it("o desconto nunca deixa o total abaixo do mínimo cobrável", () => {
    const r = calcularDescontos({ subtotalCents: 3000, cupom: cupom({ kind: "fixed", value: 99999 }) });
    expect(r.totalCents).toBe(TOTAL_MINIMO_CENTS);
    expect(r.couponCents).toBe(3000 - TOTAL_MINIMO_CENTS);
  });

  it("o Pix desconta sobre o valor JÁ com o cupom", () => {
    // subtotal 10000, cupom 10% = 1000 → 9000; Pix 5% de 9000 = 450 → 8550
    expect(calcularDescontos({ subtotalCents: 10000, cupom: cupom(), pixPercent: 5 })).toEqual({ couponCents: 1000, pixCents: 450, totalCents: 8550 });
  });

  it("Pix sozinho", () => {
    expect(calcularDescontos({ subtotalCents: 8990, pixPercent: 5 })).toEqual({ couponCents: 0, pixCents: 449, totalCents: 8541 });
  });

  it("percentual de Pix absurdo é limitado ao máximo permitido; inválido vira zero", () => {
    expect(calcularDescontos({ subtotalCents: 10000, pixPercent: 99 }).pixCents).toBe(Math.floor((10000 * PIX_DESCONTO_MAXIMO) / 100));
    for (const ruim of [-5, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(calcularDescontos({ subtotalCents: 10000, pixPercent: ruim }).pixCents, String(ruim)).toBe(0);
    }
  });

  it("a soma sempre fecha: subtotal - cupom - pix = total, tudo inteiro e positivo", () => {
    for (const subtotal of [100, 101, 999, 8990, 17981, 123457, 9_999_999]) {
      for (const c of [null, cupom(), cupom({ kind: "fixed", value: 777 }), cupom({ value: 90 })]) {
        for (const pix of [0, 3, 5, 30]) {
          const r = calcularDescontos({ subtotalCents: subtotal, cupom: c, pixPercent: pix });
          expect(r.couponCents + r.pixCents + r.totalCents).toBe(subtotal);
          expect(Number.isInteger(r.totalCents) && r.totalCents >= Math.min(TOTAL_MINIMO_CENTS, subtotal)).toBe(true);
          expect(r.couponCents >= 0 && r.pixCents >= 0).toBe(true);
        }
      }
    }
  });
});

describe("motivoDeRecusa (por que um cupom não vale)", () => {
  it("cupom válido não tem motivo", () => {
    expect(motivoDeRecusa(cupom(), 10000, agora)).toBeNull();
  });
  it("inativo", () => {
    expect(motivoDeRecusa(cupom({ active: false }), 10000, agora)).toMatch(/não está ativo/i);
  });
  it("ainda não começou e já venceu", () => {
    expect(motivoDeRecusa(cupom({ startsAt: new Date("2026-07-01T00:00:00Z") }), 10000, agora)).toMatch(/ainda não/i);
    expect(motivoDeRecusa(cupom({ expiresAt: new Date("2026-06-01T00:00:00Z") }), 10000, agora)).toMatch(/venceu/i);
  });
  it("no exato instante do vencimento já não vale", () => {
    expect(motivoDeRecusa(cupom({ expiresAt: agora }), 10000, agora)).toMatch(/venceu/i);
  });
  it("esgotado", () => {
    expect(motivoDeRecusa(cupom({ maxUses: 3, usedCount: 3 }), 10000, agora)).toMatch(/esgot/i);
    expect(motivoDeRecusa(cupom({ maxUses: 3, usedCount: 2 }), 10000, agora)).toBeNull();
  });
  it("pedido abaixo do mínimo diz quanto falta", () => {
    expect(motivoDeRecusa(cupom({ minOrderCents: 15000 }), 14999, agora)).toMatch(/R\$\s?150,00/);
    expect(motivoDeRecusa(cupom({ minOrderCents: 15000 }), 15000, agora)).toBeNull();
  });
  it("pedido pequeno demais para qualquer desconto", () => {
    expect(motivoDeRecusa(cupom(), TOTAL_MINIMO_CENTS, agora)).toMatch(/pequeno/i);
  });
});

import { rotuloDoDesconto, situacaoDoCupom } from "@/lib/discounts";

describe("situacaoDoCupom e rotuloDoDesconto", () => {
  it("resume o estado do cupom (desativado manda mais que as datas)", () => {
    expect(situacaoDoCupom(cupom(), agora)).toBe("ativo");
    expect(situacaoDoCupom(cupom({ active: false, expiresAt: new Date("2020-01-01") }), agora)).toBe("desativado");
    expect(situacaoDoCupom(cupom({ expiresAt: new Date("2026-06-01") }), agora)).toBe("vencido");
    expect(situacaoDoCupom(cupom({ maxUses: 2, usedCount: 2 }), agora)).toBe("esgotado");
    expect(situacaoDoCupom(cupom({ startsAt: new Date("2026-07-01") }), agora)).toBe("agendado");
  });
  it("escreve o desconto", () => {
    expect(rotuloDoDesconto({ kind: "percent", value: 10 })).toBe("10% OFF");
    expect(rotuloDoDesconto({ kind: "fixed", value: 1500 })).toMatch(/^R\$\s?15,00 OFF$/);
  });
});
