// ============================================================================
// Teste das migrações "CONGELADAS": o carimbo (checksum) de cada migração já publicada.
//
// Por que existe: uma migração já aplicada em algum banco NUNCA pode ser editada (o banco e o código
// passariam a ter histórias diferentes). O executor detecta isso ao subir o servidor, mas este teste
// detecta ANTES, no CI, antes de o erro chegar à produção.
//
// Quando criar uma migração nova: acrescente aqui o carimbo dela depois de publicada. Para ver o
// carimbo de todas, rode: npx tsx -e "import('./src/server/db/migrations').then(m=>console.log(m.MIGRATIONS.map(x=>[x.id,m.checksum(x)])))"
// ============================================================================

import { describe, expect, it } from "vitest";
import { MIGRATIONS, checksum } from "@/server/db/migrations";

const CONGELADAS: Record<string, string> = {
  "0001_baseline": "eb479e96eef0a0b6341d4529b2625e65b8650134dcf8c931bdfb9a1c55dbba62",
  "0002_rate_limits": "cdc90596bf2303c32a9006392cc86df40479a4044795344a45dcc435a5af015f",
  "0003_integridade": "746c0ddb80aec46e4a414151d856f4e83efe9660fb8304490e4a66125ff3f134",
  "0004_historico_de_status": "989bb9b2c1449817720e97f84b2cf495819bb1a812267dc74801b3b923820fbd",
  "0005_pagamentos": "f7d964694fcdb86361b60889bb12de40c0e28bb7a778dd4f1dc6fe3060f0d290"
};

describe("migrações congeladas", () => {
  it("nenhuma migração já publicada foi editada", () => {
    for (const [id, esperado] of Object.entries(CONGELADAS)) {
      const m = MIGRATIONS.find((x) => x.id === id);
      expect(m, `a migração ${id} sumiu da pasta db/migrations`).toBeDefined();
      expect(checksum(m!), `a migração ${id} foi EDITADA depois de publicada: crie uma migração nova em vez disso`).toBe(esperado);
    }
  });

  it("toda migração congelada continua na ordem original", () => {
    const ids = MIGRATIONS.map((m) => m.id).filter((id) => id in CONGELADAS);
    expect(ids).toEqual(Object.keys(CONGELADAS));
  });
});
