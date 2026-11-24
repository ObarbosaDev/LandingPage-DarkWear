// ============================================================================
// Testes do SEGUNDO FATOR (src/server/customers/totp.ts): o código de 6 dígitos do aplicativo autenticador
// (RFC 6238), a proteção contra reuso, o segredo guardado cifrado e o bilhete do passo intermediário do login.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  cifrarSegredo,
  codigoTotp,
  decifrarSegredo,
  gerarSegredo,
  signDesafio2fa,
  uriDoAutenticador,
  verifyDesafio2fa,
  verificarTotp,
} from "@/server/customers/totp";

const SEGREDO_DO_SITE = "segredo-de-cliente-de-teste-com-mais-de-32-caracteres";
// O segredo de teste do RFC 6238 ("12345678901234567890" em ASCII), em base32.
const RFC = base32Encode(Buffer.from("12345678901234567890"));

describe("base32", () => {
  it("vai e volta sem perder bytes", () => {
    for (const n of [1, 5, 10, 20, 33]) {
      const bytes = Buffer.alloc(n, 7).map((_, i) => (i * 31 + 5) % 256);
      expect(Buffer.from(base32Decode(base32Encode(bytes)))).toEqual(Buffer.from(bytes));
    }
  });
  it("aceita minúsculas, espaços e hífens (como o aplicativo mostra o segredo)", () => {
    expect(Buffer.from(base32Decode("gezd gnbv-gy3t qojq")).toString()).toBe("1234567890");
  });
  it("recusa caractere fora do alfabeto", () => {
    expect(() => base32Decode("ABC1")).toThrow();
    expect(() => base32Decode("ab!c")).toThrow();
  });
});

describe("codigoTotp (vetores oficiais do RFC 6238, SHA-1)", () => {
  // O RFC lista códigos de 8 dígitos; os de 6 são os 6 últimos.
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("no instante %i o código é %s", (segundos, esperado) => {
    expect(codigoTotp(RFC, Math.floor(segundos / 30))).toBe(esperado);
  });
});

describe("verificarTotp", () => {
  const agora = 1111111109 * 1000; // passo 37037036
  const passo = Math.floor(1111111109 / 30);

  it("aceita o código do passo atual e devolve o passo usado", () => {
    expect(verificarTotp(RFC, "081804", agora)).toEqual({ ok: true, passo });
  });
  it("tolera um passo de diferença no relógio (30 s para cada lado), e só isso", () => {
    expect(verificarTotp(RFC, codigoTotp(RFC, passo - 1), agora)).toMatchObject({ ok: true, passo: passo - 1 });
    expect(verificarTotp(RFC, codigoTotp(RFC, passo + 1), agora)).toMatchObject({ ok: true, passo: passo + 1 });
    expect(verificarTotp(RFC, codigoTotp(RFC, passo - 2), agora).ok).toBe(false);
    expect(verificarTotp(RFC, codigoTotp(RFC, passo + 2), agora).ok).toBe(false);
  });
  it("recusa código já usado: o passo precisa ser MAIOR que o último aceito", () => {
    expect(verificarTotp(RFC, "081804", agora, passo).ok).toBe(false);
    expect(verificarTotp(RFC, "081804", agora, passo - 1).ok).toBe(true);
  });
  it("recusa código errado, curto, longo, com letras ou vazio", () => {
    for (const ruim of ["000000", "08180", "0818045", "08180a", "", " 081804x", "081 804 9"]) {
      expect(verificarTotp(RFC, ruim, agora).ok, ruim).toBe(false);
    }
  });
  it("aceita espaços no meio do código (como o aplicativo mostra: 081 804)", () => {
    expect(verificarTotp(RFC, "081 804", agora).ok).toBe(true);
  });
  it("nunca lança com entrada estranha", () => {
    expect(verificarTotp(RFC, undefined as unknown as string, agora).ok).toBe(false);
    expect(verificarTotp("@@@", "081804", agora).ok).toBe(false);
  });
});

describe("gerarSegredo e uriDoAutenticador", () => {
  it("gera segredos diferentes, de 160 bits (32 letras em base32)", () => {
    const a = gerarSegredo();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(gerarSegredo()).not.toBe(a);
  });
  it("monta o endereço otpauth que o aplicativo lê, com o e-mail e o emissor escapados", () => {
    const uri = uriDoAutenticador("ana+loja@exemplo.com", "ABCDEFGHIJKLMNOP", "DarkWear");
    expect(uri).toBe("otpauth://totp/DarkWear:ana%2Bloja%40exemplo.com?secret=ABCDEFGHIJKLMNOP&issuer=DarkWear&algorithm=SHA1&digits=6&period=30");
  });
});

describe("cifrarSegredo (o banco nunca guarda o segredo em claro)", () => {
  it("decifra o que cifrou e o texto cifrado não contém o segredo", () => {
    const segredo = gerarSegredo();
    const c = cifrarSegredo(segredo, SEGREDO_DO_SITE);
    expect(c).not.toContain(segredo);
    expect(decifrarSegredo(c, SEGREDO_DO_SITE)).toBe(segredo);
  });
  it("cada cifragem é diferente (vetor aleatório) e todas decifram", () => {
    const s = gerarSegredo();
    expect(cifrarSegredo(s, SEGREDO_DO_SITE)).not.toBe(cifrarSegredo(s, SEGREDO_DO_SITE));
  });
  it("com outro segredo do site, ou texto adulterado, não decifra", () => {
    const c = cifrarSegredo(gerarSegredo(), SEGREDO_DO_SITE);
    expect(decifrarSegredo(c, "outro-segredo-qualquer-com-mais-de-32-caracteres-aqui")).toBeNull();
    expect(decifrarSegredo(c.slice(0, -2) + "AA", SEGREDO_DO_SITE)).toBeNull();
    expect(decifrarSegredo("lixo", SEGREDO_DO_SITE)).toBeNull();
    expect(decifrarSegredo("", SEGREDO_DO_SITE)).toBeNull();
  });
  it("recusa segredo do site curto", () => {
    expect(() => cifrarSegredo("ABC", "curto")).toThrow();
  });
});

describe("bilhete do passo do código (entre a senha e o código)", () => {
  const agora = 1_000_000_000_000;
  it("vale para a conta certa por poucos minutos", () => {
    const t = signDesafio2fa({ id: 7, version: 3 }, SEGREDO_DO_SITE, agora);
    expect(verifyDesafio2fa(t, SEGREDO_DO_SITE, agora + 60_000)).toEqual({ id: 7, version: 3 });
    expect(verifyDesafio2fa(t, SEGREDO_DO_SITE, agora + 4 * 60_000)).toEqual({ id: 7, version: 3 });
    expect(verifyDesafio2fa(t, SEGREDO_DO_SITE, agora + 6 * 60_000)).toBeNull();
  });
  it("recusa adulterado, com outro segredo e lixo", () => {
    const t = signDesafio2fa({ id: 7, version: 3 }, SEGREDO_DO_SITE, agora);
    const [dados, ass] = t.split(".");
    const outro = Buffer.from(JSON.stringify({ id: 1, v: 3, exp: agora + 999_999 })).toString("base64url");
    expect(verifyDesafio2fa(`${outro}.${ass}`, SEGREDO_DO_SITE, agora)).toBeNull();
    expect(verifyDesafio2fa(`${dados}.${ass.slice(1)}x`, SEGREDO_DO_SITE, agora)).toBeNull();
    expect(verifyDesafio2fa(t, "outro-segredo-qualquer-com-mais-de-32-caracteres-aqui", agora)).toBeNull();
    for (const lixo of ["", "a", "a.b.c", ".", "x".repeat(2000)]) expect(verifyDesafio2fa(lixo, SEGREDO_DO_SITE, agora), lixo).toBeNull();
  });
  it("não pode ser usado como cookie de sessão (prefixos diferentes)", async () => {
    const { verifySession } = await import("@/server/customers/token");
    const t = signDesafio2fa({ id: 7, version: 3 }, SEGREDO_DO_SITE, Date.now());
    expect(verifySession(t, SEGREDO_DO_SITE)).toBeNull();
  });
});
