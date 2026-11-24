// ============================================================================
// Sessão do CLIENTE: o cookie que prova "quem é você" depois do login.
//
// Quem usa: as ações de entrar/sair (src/app/actions-cliente.ts), as páginas de /conta, a sacola, a
// rota POST /api/orders e a tela de retorno do pagamento (todas chamam currentCustomer ou
// requireCustomer).
//
// Como funciona (o mesmo modelo do painel do dono, src/server/admin/auth.ts):
//   - o cookie guarda "<dados>.<assinatura>": os dados dizem quem é o cliente (id), a "versão da sessão"
//     e quando vence; a assinatura é um HMAC-SHA256 com CUSTOMER_SESSION_SECRET. Quem não tem o segredo
//     não consegue fabricar nem alterar um cookie;
//   - a VERSÃO é a novidade: ela também fica na conta (customers.session_version). Trocar a senha ou
//     "sair de todos os aparelhos" aumenta o número no banco, e todos os cookies antigos deixam de bater;
//   - a assinatura leva um prefixo próprio ("cliente."): mesmo que o dono, por engano, use o mesmo
//     segredo no painel e nas contas, um token de um lado nunca vale no outro.
//
// O cookie vale no site todo (path "/") porque a sacola, a conta e o retorno do pagamento precisam dele,
// e é "lax" (não "strict") de propósito: ao voltar da página do Mercado Pago, o navegador chega por
// navegação vinda de outro site, e um cookie "strict" não seria enviado, parecendo que a pessoa deslogou.
// ============================================================================

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCustomer, type CustomerView } from "@/server/customers";

/** Nome do cookie da sessão do cliente. */
export const COOKIE_CLIENTE = "dw_cliente";

// A sessão dura 30 dias. Passar disso, a pessoa entra de novo.
const DIAS = 30;
const MS_DIA = 24 * 3600 * 1000;

/** O segredo que assina as sessões, ou null se não está configurado ou é curto demais (mínimo 32 caracteres). */
function segredoDaSessao(): string | null {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  return typeof s === "string" && s.length >= 32 ? s : null;
}

// A assinatura de um texto. O prefixo "cliente." separa estes tokens dos do painel (ver o topo do arquivo).
const assinar = (dados: string, segredo: string) => createHmac("sha256", segredo).update(`cliente.${dados}`).digest("base64url");

/**
 * Monta o token da sessão: "<dados>.<assinatura>". Exportada para os testes; o login usa
 * startCustomerSession, que a chama.
 * @throws se o segredo for curto: um segredo fraco é fácil de adivinhar por tentativa e erro
 */
export function signSession(p: { id: number; version: number; exp: number }, segredo: string): string {
  if (typeof segredo !== "string" || segredo.length < 32) throw new Error("O segredo da sessão precisa ter pelo menos 32 caracteres.");
  const dados = Buffer.from(JSON.stringify({ id: p.id, v: p.version, exp: p.exp })).toString("base64url");
  return `${dados}.${assinar(dados, segredo)}`;
}

/**
 * Confere um token e devolve o id e a versão que ele afirma, ou null se for inválido: malformado,
 * assinatura errada (adulterado ou feito com outro segredo), vencido, com validade absurda ou com
 * id/versão que não são inteiros positivos. Não consulta o banco (isso é o currentCustomer).
 *
 * @param agora o "agora" em milissegundos (parâmetro só para os testes)
 */
export function verifySession(token: string, segredo: string, agora: number = Date.now()): { id: number; version: number } | null {
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
    const { id, v, exp } = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as { id?: unknown; v?: unknown; exp?: unknown };
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return null;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) return null;
    // Vencido, ou com validade maior que a que nós damos (mais de 31 dias): não foi feito por nós.
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= agora || exp > agora + (DIAS + 1) * MS_DIA) return null;
    return { id, version: v };
  } catch {
    return null;
  }
}

/**
 * Abre a sessão: grava o cookie no navegador. Chamada depois de uma senha certa (ou de um cadastro novo).
 * @param version a versão da sessão da conta naquele momento (customers.session_version)
 */
export async function startCustomerSession(id: number, version: number): Promise<void> {
  const segredo = segredoDaSessao();
  if (!segredo) throw new Error("CUSTOMER_SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  const token = signSession({ id, version, exp: Date.now() + DIAS * MS_DIA }, segredo);
  (await cookies()).set(COOKIE_CLIENTE, token, {
    // httpOnly: o JavaScript da página não lê o cookie (protege contra roubo por script injetado).
    httpOnly: true,
    // lax: enviado em navegação normal e na volta de outro site (o retorno do Mercado Pago), mas não em
    // requisições de formulário vindas de outros sites (protege contra CSRF).
    sameSite: "lax",
    // secure: em produção, só trafega por HTTPS.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DIAS * 24 * 3600,
  });
}

/** Encerra a sessão neste aparelho (botão "Sair"): apaga o cookie, no mesmo caminho em que foi gravado. */
export async function endCustomerSession(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_CLIENTE, path: "/" });
}

/**
 * Quem está logado agora, ou null. Confere, nesta ordem: o cookie existe, a assinatura e a validade
 * estão certas, a conta existe e NÃO foi anonimizada, e a versão da sessão do cookie é EXATAMENTE a da
 * conta (se a senha mudou ou a pessoa saiu de todos os aparelhos, a versão avançou e o cookie velho cai).
 * Sem segredo configurado, ninguém está logado.
 */
export async function currentCustomer(): Promise<CustomerView | null> {
  await connection(); // a validade depende da hora atual: sempre no momento do pedido
  const segredo = segredoDaSessao();
  if (!segredo) return null;
  const token = (await cookies()).get(COOKIE_CLIENTE)?.value;
  if (!token) return null;
  const sessao = verifySession(token, segredo);
  if (!sessao) return null;
  const cliente = await getCustomer(sessao.id);
  if (!cliente || cliente.sessionVersion !== sessao.version) return null;
  return cliente;
}

/**
 * Chame no início de toda página e ação que exige conta: sem sessão válida, leva à entrada e guarda
 * para onde voltar. Cada página e cada ação repete a conferência de propósito: uma ação pode ser
 * chamada direto, sem passar pela página.
 *
 * @param next para onde voltar depois de entrar (passa por safeNext; qualquer destino suspeito vira /conta)
 */
export async function requireCustomer(next?: string): Promise<CustomerView> {
  const cliente = await currentCustomer();
  if (!cliente) redirect(`/conta/entrar?next=${encodeURIComponent(safeNext(next))}`);
  return cliente;
}

/**
 * Escolhe com segurança para onde levar a pessoa depois do login. O destino vem da URL
 * (/conta/entrar?next=...), ou seja, de quem controla o link: sem esta conferência, um link
 * malicioso poderia levar a vítima, já logada, para outro site (redirecionamento aberto).
 *
 * Só passam caminhos DO PRÓPRIO SITE dentro de /conta ou o /carrinho. Qualquer outra coisa (outro site,
 * "//", barra invertida, "..", caracteres de controle, /admin, esquemas como javascript:) volta o padrão.
 */
export function safeNext(bruto: unknown, padrao: string = "/conta"): string {
  if (typeof bruto !== "string" || bruto.length === 0 || bruto.length > 300) return padrao;
  // Espaços, caracteres de controle (inclui quebra de linha, que permitiria injetar cabeçalho) e barra invertida.
  if (/[\u0000- \u007f\\]/.test(bruto)) return padrao;
  // Precisa começar com UMA barra: "//x" e "/\x" seriam interpretados pelo navegador como outro site.
  if (!bruto.startsWith("/") || bruto.startsWith("//")) return padrao;

  const caminho = bruto.split(/[?#]/)[0];
  // Também confere o caminho DECODIFICADO: "%2e%2e" e "%5c" valem ".." e "\" para o navegador.
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    return padrao;
  }
  if (decodificado.includes("..") || decodificado.includes("\\") || decodificado.includes("//")) return padrao;

  const permitido = (c: string) => c === "/conta" || c.startsWith("/conta/") || c === "/carrinho";
  return permitido(caminho) && permitido(decodificado) ? bruto : padrao;
}
