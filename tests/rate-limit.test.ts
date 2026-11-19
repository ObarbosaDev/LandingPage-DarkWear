// ============================================================================
// Testes do LIMITE DE USO (src/server/rate-limit.ts): quantas chamadas uma origem pode fazer e como
// a origem é identificada.
// Por que testar: é a defesa contra quem tentaria esgotar o estoque com pedidos falsos em série.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db";
import { rateLimits } from "@/server/db/schema";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { resetDb } from "./helpers/db";

// Os cabeçalhos do pedido atual, trocados em cada teste.
// O vi.mock substitui o "next/headers" (que só funciona dentro de uma requisição real do Next) por
// uma versão que devolve os cabeçalhos definidos acima.
let cabecalhos: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(cabecalhos) }));

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(rateLimits);
  cabecalhos = {};
});

const MIN = 60 * 1000;

describe("rateLimit", () => {
  // Parâmetros de rateLimit: (tipo, origem, máximo de chamadas, tamanho da janela).
  it("libera até o limite e recusa a partir daí", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("t", "a", 3, MIN)).allowed, `chamada ${i + 1}`).toBe(true);
    const r = await rateLimit("t", "a", 3, MIN);
    expect(r.allowed).toBe(false);
    // O tempo de espera sugerido (Retry-After) deve ser positivo e caber na janela.
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("cada origem e cada tipo de chamada têm o seu próprio limite", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("t", "a", 3, MIN);
    expect((await rateLimit("t", "a", 3, MIN)).allowed).toBe(false);
    expect((await rateLimit("t", "b", 3, MIN)).allowed).toBe(true); // outra origem
    expect((await rateLimit("outro", "a", 3, MIN)).allowed).toBe(true); // outro tipo
  });

  // Chamadas de 2 minutos atrás, numa janela de 1 minuto: já não contam.
  it("chamadas antigas saem da janela e liberam de novo", async () => {
    const db = await getDb();
    const velha = new Date(Date.now() - 2 * MIN);
    await db.insert(rateLimits).values(Array.from({ length: 5 }, () => ({ bucket: "t", key: "a", at: velha })));
    expect((await rateLimit("t", "a", 3, MIN)).allowed).toBe(true);
  });

  // Quem insiste depois de recusado não ganha nada: as chamadas recusadas também ocupam a fila.
  it("insistir depois de recusado não libera mais cedo", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("t", "a", 3, MIN);
    for (let i = 0; i < 5; i++) expect((await rateLimit("t", "a", 3, MIN)).allowed).toBe(false);
  });

  // Defeito real que este teste pegou: com 10 chamadas juntas, as 10 eram recusadas (inclusive as 4
  // primeiras). A solução foi dar a cada chamada uma posição na fila; agora passam exatamente 4.
  it("chamadas simultâneas não passam juntas pela última vaga", async () => {
    const r = await Promise.all(Array.from({ length: 10 }, () => rateLimit("t", "a", 4, MIN)));
    expect(r.filter((x) => x.allowed)).toHaveLength(4);
  });
});

describe("clientKey", () => {
  it("prefere o cabeçalho da hospedagem", async () => {
    cabecalhos = { "x-vercel-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" };
    expect(await clientKey()).toBe("9.9.9.9");
  });

  it("usa o x-real-ip quando não há o da Vercel", async () => {
    cabecalhos = { "x-real-ip": "8.8.8.8" };
    expect(await clientKey()).toBe("8.8.8.8");
  });

  // O x-forwarded-for pode ser inventado por quem faz a chamada: confiar nele permitiria burlar o
  // limite trocando o valor a cada tentativa.
  it("ignora o x-forwarded-for, que o cliente pode inventar", async () => {
    cabecalhos = { "x-forwarded-for": "6.6.6.6" };
    expect(await clientKey()).toBe("local");
  });

  it("pega só o primeiro endereço de uma lista e limita o tamanho", async () => {
    cabecalhos = { "x-real-ip": "1.1.1.1, 2.2.2.2" };
    expect(await clientKey()).toBe("1.1.1.1");
    cabecalhos = { "x-real-ip": "x".repeat(300) };
    expect((await clientKey()).length).toBe(64);
  });
});
