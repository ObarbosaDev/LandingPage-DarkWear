// ============================================================================
// Testes da VALIDAÇÃO DA ENCOMENDA PERSONALIZADA (validateCustom em src/server/custom-orders.ts).
// Por que testar: o navegador pode enviar qualquer coisa (inclusive de um script, sem passar pela
// tela). O servidor só pode aceitar opções que existem e textos de tamanho razoável.
// ============================================================================

import { describe, expect, it } from "vitest";
import { validateCustom } from "@/server/custom-orders";
import { COLORS, MODELS, PLACEMENTS, SIZES } from "@/lib/custom-order-options";

// Uma encomenda válida, usada como base: cada teste troca só o que quer provar.
const ok = { name: "Ana", model: "Oversized", color: "Preta", size: "G", placement: "costas", notes: "Arte grande", fileName: "arte.png" };

describe("validateCustom", () => {
  it("aceita uma encomenda válida", () => {
    const r = validateCustom(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order).toMatchObject({ model: "Oversized", color: "Preta", size: "G", placement: "costas" });
  });

  // Garante que tela e servidor concordam: tudo o que a tela oferece é aceito pelo servidor.
  // (Antes, a lista existia em dois lugares e podia divergir.)
  it("aceita todas as opções que a tela oferece", () => {
    for (const model of MODELS) expect(validateCustom({ ...ok, model }).ok, model).toBe(true);
    for (const size of SIZES) expect(validateCustom({ ...ok, size }).ok, size).toBe(true);
    for (const color of COLORS) expect(validateCustom({ ...ok, color }).ok, color).toBe(true);
    for (const p of PLACEMENTS) expect(validateCustom({ ...ok, placement: p.id }).ok, p.id).toBe(true);
  });

  // A loja não trabalha com moletom: nenhuma encomenda dele é aceita (nem escrito de outro jeito).
  it("não aceita moletom, nem com outra grafia", () => {
    for (const model of ["Moletom", "moletom", "MOLETOM", " Moletom", "Hoodie"]) {
      expect(validateCustom({ ...ok, model }).ok, model).toBe(false);
    }
    expect(MODELS).toEqual(["Camiseta", "Oversized"]);
  });

  it("recusa opções fora da lista", () => {
    expect(validateCustom({ ...ok, model: "Jaqueta" }).ok).toBe(false);
    expect(validateCustom({ ...ok, size: "XXG" }).ok).toBe(false);
    expect(validateCustom({ ...ok, color: "Verde" }).ok).toBe(false);
    expect(validateCustom({ ...ok, placement: "cabeça" }).ok).toBe(false);
  });

  // Corpo da requisição vazio, número, texto, lista... nada disso pode causar erro: só recusa.
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
