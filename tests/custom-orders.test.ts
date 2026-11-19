import { describe, expect, it } from "vitest";
import { validateCustom } from "@/server/custom-orders";
import { COLORS, MODELS, PLACEMENTS, SIZES } from "@/lib/custom-order-options";

const ok = { name: "Ana", model: "Oversized", color: "Preta", size: "G", placement: "costas", notes: "Arte grande", fileName: "arte.png" };

describe("validateCustom", () => {
  it("aceita uma encomenda válida", () => {
    const r = validateCustom(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order).toMatchObject({ model: "Oversized", color: "Preta", size: "G", placement: "costas" });
  });

  it("aceita todas as opções que a tela oferece", () => {
    for (const model of MODELS) expect(validateCustom({ ...ok, model }).ok, model).toBe(true);
    for (const size of SIZES) expect(validateCustom({ ...ok, size }).ok, size).toBe(true);
    for (const color of COLORS) expect(validateCustom({ ...ok, color }).ok, color).toBe(true);
    for (const p of PLACEMENTS) expect(validateCustom({ ...ok, placement: p.id }).ok, p.id).toBe(true);
  });

  it("recusa opções fora da lista", () => {
    expect(validateCustom({ ...ok, model: "Jaqueta" }).ok).toBe(false);
    expect(validateCustom({ ...ok, size: "XXG" }).ok).toBe(false);
    expect(validateCustom({ ...ok, color: "Verde" }).ok).toBe(false);
    expect(validateCustom({ ...ok, placement: "cabeça" }).ok).toBe(false);
  });

  it("não quebra com entrada estranha", () => {
    for (const entrada of [null, undefined, "texto", 42, [], {}]) {
      expect(validateCustom(entrada).ok).toBe(false);
    }
  });

  it("corta textos longos e ignora tipos errados", () => {
    const r = validateCustom({ ...ok, name: "x".repeat(200), notes: "y".repeat(2000), fileName: 123 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.name).toHaveLength(60);
      expect(r.order.notes).toHaveLength(500);
      expect(r.order.fileName).toBeUndefined();
    }
  });
});
