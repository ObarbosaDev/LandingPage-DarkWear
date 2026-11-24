// ============================================================================
// Testes das frases do diário do painel (src/lib/audit-labels.ts).
// ============================================================================

import { describe, expect, it } from "vitest";
import { fraseDaAcao, nomeCurtoDoAtor } from "@/lib/audit-labels";
import { ACOES_AUDITADAS } from "@/server/admin/audit";

describe("fraseDaAcao", () => {
  it("toda ação registrada tem uma frase em português (nenhuma aparece como código)", () => {
    for (const a of ACOES_AUDITADAS) expect(fraseDaAcao(a), a).not.toBe(a);
  });
  it("ação desconhecida aparece como está, sem quebrar", () => {
    expect(fraseDaAcao("algo.novo")).toBe("algo.novo");
  });
});

describe("nomeCurtoDoAtor", () => {
  it("mostra só a parte antes do @", () => {
    expect(nomeCurtoDoAtor("ana.admin@exemplo.com")).toBe("ana.admin");
    expect(nomeCurtoDoAtor("sem-arroba")).toBe("sem-arroba");
    expect(nomeCurtoDoAtor("@x")).toBe("@x");
  });
});
