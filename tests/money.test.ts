// ============================================================================
// Testes de DINHEIRO (src/lib/money.ts): a formatação de centavos em reais.
// Por que testar: preço mal formatado ou com erro de arredondamento passa direto ao cliente.
// ============================================================================

import { describe, expect, it } from "vitest";
import { formatCents } from "@/lib/money";

describe("formatCents", () => {
  // O Intl usa espaço não separável entre "R$" e o número; normalizamos para comparar.
  const txt = (c: number) => formatCents(c).replace(/\s/g, " ");

  // Os formatos esperados pelo cliente brasileiro: vírgula nos centavos e ponto no milhar.
  it("formata em reais", () => {
    expect(txt(8990)).toBe("R$ 89,90");
    expect(txt(0)).toBe("R$ 0,00");
    expect(txt(129900)).toBe("R$ 1.299,00");
  });

  // Justifica trabalhar em centavos: somar valores inteiros é exato.
  it("não tem erro de ponto flutuante nas somas", () => {
    // 3 x 89,90 em decimal dá 269.70000000000005; em centavos é exato.
    expect(txt(8990 * 3)).toBe("R$ 269,70");
  });
});
