// ============================================================================
// SEGUNDO FATOR: o código de 6 dígitos do aplicativo autenticador (TOTP, RFC 6238).
//
// Quem usa: o login (src/app/actions-cliente.ts), o cadastro do segundo fator pelo terminal (scripts/admin.ts)
// e os testes. É um arquivo PURO (só node:crypto, sem banco nem cookies).
//
// Como funciona: o servidor e o aplicativo (Google Authenticator, Authy, 1Password...) dividem um SEGREDO. A cada 30
// segundos os dois calculam o mesmo número de 6 dígitos a partir do segredo e da hora. Quem tem a senha mas não
// tem o aplicativo não passa. Regras desta implementação:
//   - o código do passo anterior e do seguinte também valem (relógios ligeiramente fora de hora);
//   - cada código só vale UMA vez: o login guarda o último passo aceito e recusa qualquer passo igual ou menor;
//   - o segredo é guardado CIFRADO no banco (AES-256-GCM, com chave derivada de CUSTOMER_SESSION_SECRET): quem
//     lê o banco não consegue gerar os códigos.
// ============================================================================

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// ---------- base32 (o formato em que os aplicativos mostram o segredo) ----------

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Bytes → texto em base32 (sem o preenchimento "="). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let out = "";
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO[(valor << (5 - bits)) & 31];
  return out;
}

/** Texto em base32 → bytes. Ignora espaços, hífens e "=" e aceita minúsculas; lança se houver letra fora do alfabeto. */
export function base32Decode(texto: string): Uint8Array {
  const limpo = texto.replace(/[\s\-=]/g, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error("Caractere inválido em base32.");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

// ---------- o código ----------

const PASSO_SEGUNDOS = 30;

/** Um segredo novo: 160 bits aleatórios em base32 (32 letras). */
export function gerarSegredo(): string {
  return base32Encode(randomBytes(20));
}

/** O código de 6 dígitos de um passo (cada passo = 30 segundos desde 1970). RFC 4226/6238, com SHA-1. */
export function codigoTotp(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac("sha1", base32Decode(segredo)).update(contador).digest();
  // "Dynamic truncation": 4 bytes a partir de uma posição que o próprio resumo indica.
  const i = h[h.length - 1] & 15;
  const n = ((h[i] & 0x7f) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * Confere o código que a pessoa digitou. Devolve o passo usado (para o chamador guardá-lo e recusar reuso), ou
 * { ok: false }. Nunca lança: entrada estranha apenas não confere.
 *
 * @param ultimoPasso o último passo já aceito para esta conta: só passos MAIORES valem (um código não se repete)
 * @param agora       o "agora" em milissegundos (parâmetro só para os testes)
 */
export function verificarTotp(
  segredo: string,
  digitado: string,
  agora: number = Date.now(),
  ultimoPasso = 0,
): { ok: true; passo: number } | { ok: false } {
  try {
    if (typeof digitado !== "string") return { ok: false };
    const limpo = digitado.replace(/\s/g, "");
    if (!/^\d{6}$/.test(limpo)) return { ok: false };
    const atual = Math.floor(agora / 1000 / PASSO_SEGUNDOS);
    let achado: number | null = null;
    // Confere os três passos sem parar no primeiro (o tempo de resposta não diz qual deles acertou).
    for (const passo of [atual - 1, atual, atual + 1]) {
      const esperado = Buffer.from(codigoTotp(segredo, passo));
      const recebido = Buffer.from(limpo);
      if (timingSafeEqual(esperado, recebido) && passo > ultimoPasso) achado ??= passo;
    }
    return achado === null ? { ok: false } : { ok: true, passo: achado };
  } catch {
    return { ok: false };
  }
}

/** O endereço "otpauth://" que o aplicativo autenticador lê (digitado à mão ou por QR code). */
export function uriDoAutenticador(email: string, segredo: string, emissor: string): string {
  return `otpauth://totp/${encodeURIComponent(emissor)}:${encodeURIComponent(email)}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PASSO_SEGUNDOS}`;
}

// ---------- o segredo, cifrado no banco ----------

/** A chave de cifragem, derivada do segredo do site (nunca o próprio segredo do site usado direto). */
function chaveDeCifragem(segredoDoSite: string): Buffer {
  if (typeof segredoDoSite !== "string" || segredoDoSite.length < 32) throw new Error("O segredo do site precisa ter pelo menos 32 caracteres.");
  return Buffer.from(hkdfSync("sha256", segredoDoSite, "", "darkwear-totp-v1", 32));
}

/** Cifra o segredo do autenticador para guardar no banco: "v1.<iv>.<marca>.<texto>" (AES-256-GCM). */
export function cifrarSegredo(segredo: string, segredoDoSite: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveDeCifragem(segredoDoSite), iv);
  const texto = Buffer.concat([c.update(segredo, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), texto.toString("base64url")].join(".");
}

/** Decifra o que cifrarSegredo guardou. null se estiver adulterado, for de outro site ou não for um texto cifrado. */
export function decifrarSegredo(guardado: string, segredoDoSite: string): string | null {
  try {
    const [v, iv, marca, texto, resto] = String(guardado).split(".");
    if (v !== "v1" || !iv || !marca || !texto || resto !== undefined) return null;
    const d = createDecipheriv("aes-256-gcm", chaveDeCifragem(segredoDoSite), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(marca, "base64url"));
    return Buffer.concat([d.update(Buffer.from(texto, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- o bilhete entre a senha e o código ----------

/** Cookie do bilhete: prova que a senha deste login já foi conferida e falta só o código. */
export const COOKIE_2FA = "dw_2fa";
/** Quanto tempo a pessoa tem para digitar o código depois de acertar a senha. */
export const MINUTOS_DO_BILHETE = 5;

const assinarDesafio = (dados: string, segredo: string) => createHmac("sha256", segredo).update(`2fa.${dados}`).digest("base64url");

/**
 * Monta o bilhete: "<dados>.<assinatura>" com o id da conta, a versão da sessão e a validade (5 minutos). O prefixo
 * "2fa." na assinatura faz com que ele NUNCA valha como cookie de sessão (e vice-versa).
 */
export function signDesafio2fa(p: { id: number; version: number }, segredo: string, agora: number = Date.now()): string {
  if (typeof segredo !== "string" || segredo.length < 32) throw new Error("O segredo da sessão precisa ter pelo menos 32 caracteres.");
  const dados = Buffer.from(JSON.stringify({ id: p.id, v: p.version, exp: agora + MINUTOS_DO_BILHETE * 60_000 })).toString("base64url");
  return `${dados}.${assinarDesafio(dados, segredo)}`;
}

/** Confere o bilhete e devolve a conta, ou null (adulterado, vencido, de outro site ou malformado). */
export function verifyDesafio2fa(token: string, segredo: string, agora: number = Date.now()): { id: number; version: number } | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 500) return null;
  if (typeof segredo !== "string" || segredo.length < 32) return null;
  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  const esperada = Buffer.from(assinarDesafio(partes[0], segredo));
  const recebida = Buffer.from(partes[1]);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const { id, v, exp } = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8")) as { id?: unknown; v?: unknown; exp?: unknown };
    if (!Number.isSafeInteger(id) || (id as number) < 1) return null;
    if (!Number.isSafeInteger(v) || (v as number) < 1) return null;
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= agora) return null;
    return { id: id as number, version: v as number };
  } catch {
    return null;
  }
}
