// ============================================================================
// O TOKEN da sessão do cliente: montar e conferir o texto assinado que vai no cookie.
//
// Fica num arquivo PURO (só usa node:crypto, sem "server-only", sem cookies, sem banco) de propósito: o porteiro
// do painel (src/proxy.ts) roda antes de qualquer página e precisa conferir o cookie sem carregar o resto do
// servidor. A parte que depende de cookies e banco fica em ./session.ts, que reexporta o que está aqui.
//
// Como funciona: o cookie guarda "<dados>.<assinatura>". Os dados dizem quem é o cliente (id), a "versão da
// sessão", o instante do login (iat), o PAPEL no momento do login (r) e quando vence; a assinatura é um
// HMAC-SHA256 com CUSTOMER_SESSION_SECRET. Quem não tem o segredo não consegue fabricar nem alterar um cookie.
// A assinatura leva um prefixo próprio ("cliente."): mesmo que o dono, por engano, use o mesmo segredo para outra
// coisa, um token daqui nunca vale lá.
//
// O PAPEL no cookie é só uma DICA para o porteiro barrar cedo quem claramente não é administrador. A autoridade é
// sempre o banco (requireAdmin): um administrador que perdeu o papel depois de entrar ainda tem o "admin" no cookie,
// e é o banco que o barra.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

/** Nome do cookie da sessão do cliente. */
export const COOKIE_CLIENTE = "dw_cliente";

/** A sessão dura 30 dias. Passar disso, a pessoa entra de novo. */
export const DIAS_DA_SESSAO = 30;
export const MS_DIA = 24 * 3600 * 1000;

export type PapelNoToken = "cliente" | "admin";

// A assinatura de um texto. O prefixo "cliente." separa estes tokens de qualquer outro (ver o topo do arquivo).
const assinar = (dados: string, segredo: string) => createHmac("sha256", segredo).update(`cliente.${dados}`).digest("base64url");

/**
 * Monta o token da sessão: "<dados>.<assinatura>".
 * @param iat  o instante do LOGIN (padrão: agora). Não pode ser renovado sem provar a senha (ver startCustomerSession).
 * @param role o papel da conta no momento do login: só uma dica para o porteiro do painel (ver o topo do arquivo)
 * @throws se o segredo for curto: um segredo fraco é fácil de adivinhar por tentativa e erro
 */
export function signSession(
  p: { id: number; version: number; exp: number },
  segredo: string,
  iat: number = Date.now(),
  role: PapelNoToken = "cliente",
): string {
  if (typeof segredo !== "string" || segredo.length < 32) throw new Error("O segredo da sessão precisa ter pelo menos 32 caracteres.");
  const dados = Buffer.from(JSON.stringify({ id: p.id, v: p.version, exp: p.exp, iat, r: role })).toString("base64url");
  return `${dados}.${assinar(dados, segredo)}`;
}

/**
 * Confere um token e devolve o que ele afirma, ou null se for inválido: malformado, assinatura errada (adulterado
 * ou feito com outro segredo), vencido, com validade absurda ou com id/versão que não são inteiros positivos.
 * Não consulta o banco (isso é o currentSession). O papel só é "admin" se o token, ASSINADO por nós, disser
 * exatamente isso; qualquer outra coisa (ausente, desconhecido) vale como "cliente".
 *
 * @param agora o "agora" em milissegundos (parâmetro só para os testes)
 */
export function verifySession(
  token: string,
  segredo: string,
  agora: number = Date.now(),
): { id: number; version: number; iat: number; role: PapelNoToken } | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 1000) return null;
  if (typeof segredo !== "string" || segredo.length < 32) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [dados, assinatura] = partes;
  if (!dados || !assinatura) return null;

  // Refaz a assinatura e compara em tempo constante (não revela a assinatura certa pelo tempo de resposta).
  const esperada = Buffer.from(assinar(dados, segredo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  // A assinatura bateu: agora confere o conteúdo. Mesmo assinado por nós, um valor estranho é recusado.
  try {
    const { id, v, exp, iat, r } = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as {
      id?: unknown;
      v?: unknown;
      exp?: unknown;
      iat?: unknown;
      r?: unknown;
    };
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return null;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) return null;
    // Vencido, ou com validade maior que a que nós damos (mais de 31 dias): não foi feito por nós.
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= agora || exp > agora + (DIAS_DA_SESSAO + 1) * MS_DIA) return null;
    // Cookie de antes do "iat" conta como login antigo: vale para o site, nunca para o painel.
    return { id, version: v, iat: typeof iat === "number" && Number.isFinite(iat) ? iat : 0, role: r === "admin" ? "admin" : "cliente" };
  } catch {
    return null;
  }
}
