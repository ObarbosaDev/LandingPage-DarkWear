// ============================================================================
// Teste de REGRESSÃO do vazamento do painel: o layout de /admin não pode definir título.
// Por que testar: quem não é administrador recebe um "não encontrado" que tem de ser IDÊNTICO ao de qualquer
// endereço inexistente. Se o layout do painel definir um título ("Painel"), esse título aparece também na
// resposta 404 e entrega que existe um painel ali. Isso já aconteceu uma vez (visto no HTML de /admin) e o
// defeito não aparece em nenhum outro teste.
// ============================================================================

import { describe, expect, it } from "vitest";
import { metadata } from "@/app/admin/layout";

describe("layout de /admin", () => {
  it("não define título (cada página do painel define o seu)", () => {
    expect(metadata.title).toBeUndefined();
  });

  it("continua fora dos buscadores", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
