// ============================================================================
// Teste do link de WhatsApp PARA UM CLIENTE (src/lib/whatsapp.ts → clienteWhatsappLink), usado no painel para o
// dono chamar quem fez um pedido.
// Por que testar: o celular vem do banco e vira parte de um endereço. Um valor estranho não pode gerar um link
// quebrado nem apontar para outro lugar: só dígitos de um número brasileiro entram.
// ============================================================================

import { describe, expect, it } from "vitest";
import { clienteWhatsappLink } from "@/lib/whatsapp";

describe("clienteWhatsappLink", () => {
  it("monta o link com o código do Brasil e a mensagem codificada", () => {
    expect(clienteWhatsappLink("11987654321", "Olá! Sobre o pedido DW-00001")).toBe("https://wa.me/5511987654321?text=Ol%C3%A1!%20Sobre%20o%20pedido%20DW-00001");
  });

  it("sem mensagem, abre só a conversa", () => {
    expect(clienteWhatsappLink("1133334444")).toBe("https://wa.me/551133334444");
  });

  it.each(["", "abc", "119876543", "119876543210", "11 98765-4321", "+5511987654321", "11987654321/../x", "11987654321?text=x", "11987654321\n", "../../etc"])(
    "celular inválido %j devolve null (nunca um link estranho)",
    (celular) => {
      expect(clienteWhatsappLink(celular)).toBeNull();
    },
  );

  it("celular de conta excluída (vazio) devolve null", () => {
    expect(clienteWhatsappLink("")).toBeNull();
  });

  it("a mensagem não consegue escapar do parâmetro (tudo é codificado)", () => {
    const l = clienteWhatsappLink("11987654321", "a&phone=999#x y");
    expect(l).toBe("https://wa.me/5511987654321?text=a%26phone%3D999%23x%20y");
  });
});
