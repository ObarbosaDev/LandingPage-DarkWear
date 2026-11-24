// ============================================================================
// Testes dos TEXTOS dos pedidos mostrados ao cliente (src/lib/order-labels.ts).
// Por que testar: o status vira a palavra gigante da tela "Meus pedidos". Um status novo sem texto
// apareceria como "undefined" na cara do cliente.
// ============================================================================

import { describe, expect, it } from "vitest";
import { ORDER_STATUS } from "@/server/db/schema";
import { eventoDoPedido, palavraDoStatus } from "@/lib/order-labels";

describe("palavraDoStatus", () => {
  it("todo status tem uma palavra curta, sem espaços (cabe em letras gigantes)", () => {
    for (const s of ORDER_STATUS) {
      const p = palavraDoStatus(s);
      expect(p, s).toBeTruthy();
      expect(p, s).not.toMatch(/\s/);
      expect(p.length, s).toBeLessThanOrEqual(10);
    }
  });

  it("as palavras são as esperadas", () => {
    expect(ORDER_STATUS.map(palavraDoStatus)).toEqual(["Aguardando", "Pago", "Enviado", "Entregue", "Cancelado"]);
  });

  it("status desconhecido não quebra a tela", () => {
    expect(palavraDoStatus("novo-status" as never)).toBe("—");
  });
});

describe("eventoDoPedido", () => {
  it.each([
    [null, "pendente", "Pedido feito"],
    ["pendente", "pago", "Pagamento confirmado"],
    ["pago", "enviado", "Pedido enviado"],
    ["enviado", "entregue", "Pedido entregue"],
    ["pendente", "cancelado", "Pedido cancelado"],
    ["pago", "cancelado", "Pedido cancelado"],
  ] as const)("%s → %s: %s", (de, para, texto) => {
    expect(eventoDoPedido(de, para)).toBe(texto);
  });

  it("todo par de status tem um texto (nenhum 'undefined')", () => {
    for (const para of ORDER_STATUS) for (const de of [null, ...ORDER_STATUS]) expect(eventoDoPedido(de, para), `${de}→${para}`).toMatch(/\S/);
  });
});
