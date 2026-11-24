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
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCustomer, type CustomerView } from "@/server/customers";
import { COOKIE_CLIENTE, DIAS_DA_SESSAO as DIAS, MS_DIA, signSession, verifySession, type PapelNoToken } from "@/server/customers/token";

// O token (montar e conferir o texto assinado) vive em ./token.ts, um arquivo puro que o porteiro do painel também usa.
export { COOKIE_CLIENTE, signSession, verifySession };

/** O segredo que assina as sessões, ou null se não está configurado ou é curto demais (mínimo 32 caracteres). */
function segredoDaSessao(): string | null {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  return typeof s === "string" && s.length >= 32 ? s : null;
}

/**
 * Abre a sessão: grava o cookie no navegador. Chamada depois de uma senha certa (ou de um cadastro novo).
 * @param version a versão da sessão da conta naquele momento (customers.session_version)
 * @param iat     o instante do LOGIN. Padrão: agora. Ao reabrir a sessão de um aparelho que já estava logado
 *                (ex.: "sair de todos os outros"), passe o original: renovar sem a senha deixaria um cookie
 *                roubado manter o acesso ao painel para sempre.
 * @param role    o papel da conta agora: vai no cookie só como dica para o porteiro do painel (ver src/proxy.ts)
 */
export async function startCustomerSession(id: number, version: number, iat: number = Date.now(), role: PapelNoToken = "cliente"): Promise<void> {
  const segredo = segredoDaSessao();
  if (!segredo) throw new Error("CUSTOMER_SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  const token = signSession({ id, version, exp: Date.now() + DIAS * MS_DIA }, segredo, iat, role);
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
 * A sessão atual: quem está logado e QUANDO fez o login (iat). null se não há sessão válida.
 * É o que o painel usa (precisa do horário do login); o resto do site usa currentCustomer.
 * Confere, nesta ordem: o cookie existe, a assinatura e a validade estão certas, a conta existe e NÃO foi
 * anonimizada, e a versão da sessão do cookie é EXATAMENTE a da conta (se a senha mudou ou a pessoa saiu de
 * todos os aparelhos, a versão avançou e o cookie velho cai). Sem segredo configurado, ninguém está logado.
 */
export async function currentSession(): Promise<{ customer: CustomerView; iat: number } | null> {
  await connection(); // a validade depende da hora atual: sempre no momento do pedido
  const segredo = segredoDaSessao();
  if (!segredo) return null;
  const token = (await cookies()).get(COOKIE_CLIENTE)?.value;
  if (!token) return null;
  const sessao = verifySession(token, segredo);
  if (!sessao) return null;
  const cliente = await getCustomer(sessao.id);
  if (!cliente || cliente.sessionVersion !== sessao.version) return null;
  return { customer: cliente, iat: sessao.iat };
}

/** Quem está logado agora, ou null (ver currentSession para o que é conferido). */
export async function currentCustomer(): Promise<CustomerView | null> {
  return (await currentSession())?.customer ?? null;
}

/**
 * Chame no início de toda página e ação que exige conta: sem sessão válida, leva à entrada e guarda
 * para onde voltar. Cada página e cada ação repete a conferência de propósito: uma ação pode ser
 * chamada direto, sem passar pela página.
 *
 * @param next   para onde voltar depois de entrar (passa por safeNext; qualquer destino suspeito vira /conta)
 * @param opcoes permitirSenhaProvisoria: só a página da conta usa, para a pessoa poder trocar a senha provisória
 */
export async function requireCustomer(next?: string, opcoes: { permitirSenhaProvisoria?: boolean } = {}): Promise<CustomerView> {
  const cliente = await currentCustomer();
  if (!cliente) redirect(`/conta/entrar?next=${encodeURIComponent(safeNext(next))}`);
  // Quem entrou com uma senha PROVISÓRIA (gerada pelo painel ou pelo comando do dono) só pode trocá-la: todo o
  // resto fica fechado até a troca. A única tela que deixa passar é a própria página da conta.
  if (cliente.mustChangePassword && !opcoes.permitirSenhaProvisoria) redirect("/conta?trocar=1");
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

/**
 * O destino que a tela de entrar (e a de cadastro) repassa ao formulário, a partir do "?next=" da URL.
 * SEM destino na URL devolve VAZIO, de propósito (e não o padrão "/conta"): é o vazio que deixa a ação de entrar
 * levar o administrador ao painel. Se a tela repassasse "/conta" sempre, o administrador cairia na conta.
 * Com destino, ele passa por safeNext (um destino suspeito vira "/conta").
 */
export function destinoDaUrl(bruto: string | string[] | undefined): string {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  return valor ? safeNext(valor) : "";
}

