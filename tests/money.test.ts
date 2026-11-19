import { describe, expect, it } from "vitest";
import { formatCents } from "@/lib/money";

describe("formatCents", () => {
  // O Intl usa espaço não separável entre "R$" e o número; normalizamos para comparar.
  const txt = (c: number) => formatCents(c).replace(/\s/g, " ");

  it("formata em reais", () => {
    expect(txt(8990)).toBe("R$ 89,90");
    expect(txt(0)).toBe("R$ 0,00");
    expect(txt(129900)).toBe("R$ 1.299,00");
  });

  it("não tem erro de ponto flutuante nas somas", () => {
    // 3 x 89,90 em decimal dá 269.70000000000005; em centavos é exato.
    expect(txt(8990 * 3)).toBe("R$ 269,70");
  });
});
