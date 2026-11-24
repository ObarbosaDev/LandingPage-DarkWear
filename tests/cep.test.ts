// ============================================================================
// Testes da CONSULTA DE CEP (src/server/cep.ts e a rota GET /api/cep/[cep]).
// Por que testar: a rota fala com um serviço externo (ViaCEP) usando um valor que vem do navegador. Os pontos
// de segurança: só 8 dígitos chegam ao serviço externo (nada de "../" ou "?"), só quem está logado consulta,
// há limite de uso, e o que o serviço devolve é tratado como NÃO confiável (tipos, tamanhos, controle).
// O ViaCEP de verdade NUNCA é chamado: o fetch é substituído.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db";
import { rateLimits } from "@/server/db/schema";
import { CepError, lookupCep } from "@/server/cep";
import { GET } from "@/app/api/cep/[cep]/route";
import { startCustomerSession } from "@/server/customers/session";
import { clienteDeTeste, resetDb } from "./helpers/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "10.0.0.1" }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (o: { name: string }) => void jar.delete(o.name),
  }),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const viacep = { cep: "01310-100", logradouro: "Avenida Paulista", complemento: "lado ímpar", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP", ibge: "3550308", ddd: "11" };

function fakeFetch(corpo: unknown, o: { ok?: boolean; status?: number; json?: boolean } = {}) {
  const spy = vi.fn(async () => ({
    ok: o.ok ?? true,
    status: o.status ?? 200,
    json: async () => {
      if (o.json === false) throw new SyntaxError("não é JSON");
      return corpo;
    },
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(rateLimits);
  jar.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("lookupCep", () => {
  it("consulta o endereço certo do ViaCEP e devolve só os quatro campos que usamos", async () => {
    const spy = fakeFetch(viacep);
    expect(await lookupCep("01310100")).toEqual({ street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo", state: "SP" });
    const [url, init] = spy.mock.calls[0] as unknown as [string, { signal: AbortSignal }];
    expect(url).toBe("https://viacep.com.br/ws/01310100/json/");
    expect(init.signal).toBeInstanceOf(AbortSignal); // tem prazo: não espera para sempre
  });

  it("CEP que não existe (o ViaCEP responde erro) devolve null", async () => {
    fakeFetch({ erro: true });
    expect(await lookupCep("99999999")).toBeNull();
    fakeFetch({ erro: "true" });
    expect(await lookupCep("99999999")).toBeNull();
  });

  // O que sai para o serviço externo só pode ser 8 dígitos: nada de caminho, consulta ou codificação.
  it.each(["", "123", "0131010", "013101000", "0131010A", "../../x", "01310100/../x", "01310100?x=1", "%30131010", "01310100\n", "01310-100", " 01310100", "０１３１０１００"])(
    "CEP %j nem chega ao serviço externo",
    async (cep) => {
      const spy = fakeFetch(viacep);
      await expect(lookupCep(cep)).rejects.toThrow(CepError);
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it("falha de rede, resposta de erro ou corpo que não é JSON viram CepError (e a mensagem não vaza detalhes)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed: ECONNRESET 10.1.2.3"); }));
    const e1 = await lookupCep("01310100").catch((e) => e);
    expect(e1).toBeInstanceOf(CepError);
    expect(e1.message).not.toMatch(/ECONNRESET|10\.1\.2\.3/);
    fakeFetch({}, { ok: false, status: 503 });
    await expect(lookupCep("01310100")).rejects.toThrow(CepError);
    fakeFetch(null, { json: false });
    await expect(lookupCep("01310100")).rejects.toThrow(CepError);
  });

  // O que o serviço devolve não é confiável: tipos errados, textos enormes e caracteres de controle.
  it("trata a resposta como não confiável: tipos, tamanho e caracteres de controle", async () => {
    fakeFetch({ logradouro: "R".repeat(500), bairro: "Bairro\nCom\tControle", localidade: 12345, uf: "SP" });
    const r = await lookupCep("01310100");
    expect(r?.street.length).toBeLessThanOrEqual(120);
    expect(r?.district).toBe("Bairro Com Controle");
    expect(r?.city).toBe(""); // número no lugar de texto: vira vazio, o cliente digita
    expect(r?.state).toBe("SP");
  });

  it("UF inválida ou ausente na resposta vira CepError (não confiamos no resto)", async () => {
    for (const uf of ["XX", "", undefined, 7]) {
      fakeFetch({ ...viacep, uf });
      await expect(lookupCep("01310100"), String(uf)).rejects.toThrow(CepError);
    }
  });

  it("resposta que não é um objeto vira CepError", async () => {
    for (const corpo of [null, "texto", 5, [], [viacep]]) {
      fakeFetch(corpo);
      await expect(lookupCep("01310100"), JSON.stringify(corpo)).rejects.toThrow(CepError);
    }
  });

  it("CEP genérico de cidade pequena (sem rua nem bairro) devolve vazios, para o cliente completar", async () => {
    fakeFetch({ localidade: "Cidadezinha", uf: "MG", logradouro: "", bairro: "" });
    expect(await lookupCep("37000000")).toEqual({ street: "", district: "", city: "Cidadezinha", state: "MG" });
  });
});

describe("GET /api/cep/[cep]", () => {
  const chamar = (cep: string) => GET(new Request(`http://x/api/cep/${cep}`), { params: Promise.resolve({ cep }) });
  const entrar = async () => startCustomerSession(await clienteDeTeste(), 1);

  it("sem sessão: 401 e o serviço externo NÃO é chamado", async () => {
    const spy = fakeFetch(viacep);
    expect((await chamar("01310100")).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("CEP inválido: 400, sem chamar o serviço externo", async () => {
    await entrar();
    const spy = fakeFetch(viacep);
    for (const cep of ["123", "abcdefgh", "..%2f..%2fx", "01310100x", "0131010", "01310-100"]) expect((await chamar(cep)).status, cep).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("CEP válido: 200 com os quatro campos, sem cache (cada cliente, cada consulta)", async () => {
    await entrar();
    fakeFetch(viacep);
    const res = await chamar("01310100");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo", state: "SP" });
    expect(res.headers.get("cache-control")).toMatch(/no-store|private/);
  });

  it("CEP que não existe: 404", async () => {
    await entrar();
    fakeFetch({ erro: true });
    expect((await chamar("99999999")).status).toBe(404);
  });

  it("serviço fora do ar: 502 com mensagem genérica (o cliente digita o endereço à mão)", async () => {
    await entrar();
    fakeFetch({}, { ok: false, status: 500 });
    const res = await chamar("01310100");
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/viacep|500|stack/i);
  });

  it("limita as consultas: a 31ª em 10 minutos é recusada (429) e não chama o serviço", async () => {
    await entrar();
    const spy = fakeFetch(viacep);
    for (let i = 0; i < 30; i++) expect((await chamar("01310100")).status, `consulta ${i + 1}`).toBe(200);
    expect((await chamar("01310100")).status).toBe(429);
    expect(spy).toHaveBeenCalledTimes(30);
  });
});
