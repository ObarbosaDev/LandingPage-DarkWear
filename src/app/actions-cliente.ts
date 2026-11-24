// ============================================================================
// Ações do CLIENTE (Server Actions): tudo que a pessoa FAZ na sua conta.
//
// Quem usa: as telas /conta/entrar, /conta/cadastro e /conta (formulários e botões).
// O que é uma Server Action: uma função que roda no servidor mas é disparada por um formulário da tela.
//
// SEGURANÇA, em resumo:
//   - toda ação, exceto entrar e cadastrar, começa com requireCustomer(): uma ação pode ser chamada
//     direto, sem passar pela tela, então esconder a página não basta;
//   - entrar tem DOIS limites: por origem (8 tentativas em 15 min) e por e-mail (5 ERROS em 15 min, valendo
//     mesmo se vierem de origens diferentes). A mensagem de erro é a mesma para "senha errada" e "e-mail
//     inexistente";
//   - ações que pedem a senha (trocar a senha, excluir a conta) também têm limite, para quem roubou uma
//     sessão não poder adivinhar a senha por elas;
//   - a SENHA nunca volta para a tela (nem em erro): só nome, e-mail e celular são devolvidos;
//   - o destino depois do login passa por safeNext (nunca outro site).
// ============================================================================

"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  anonymizeCustomer,
  authenticate,
  changePassword,
  getCustomer,
  parseRegisterForm,
  registerCustomer,
  signOutEverywhere,
} from "@/server/customers";
import { validatePassword } from "@/server/customers/password";
import { currentSession, endCustomerSession, requireCustomer, safeNext, startCustomerSession } from "@/server/customers/session";
import { clearFailures, isLockedOut, registerFailure } from "@/server/login-attempts";
import { clientKey, rateLimit } from "@/server/rate-limit";

/**
 * O que as telas recebem de volta de uma ação: "error" (o que deu errado), "ok" (o que deu certo, sem
 * sair da tela) e "values" (o que foi digitado, para repovoar o formulário; nunca contém senha).
 */
export type ClienteFormState = { error?: string; ok?: string; values?: Record<string, string> };

const MIN = 60 * 1000;
const MUITAS_TENTATIVAS = "Muitas tentativas. Tente de novo em alguns minutos.";

// Lê um campo como texto (campo ausente ou arquivo no lugar de texto vira "").
const texto = (form: FormData, campo: string): string => (typeof form.get(campo) === "string" ? (form.get(campo) as string) : "");

// Os campos que podem voltar ao formulário depois de um erro. A senha NUNCA está aqui.
const seguros = (form: FormData): Record<string, string> => ({
  name: texto(form, "name"),
  email: texto(form, "email"),
  phone: texto(form, "phone"),
});

// ---------- Cadastro e entrada ----------

/**
 * Formulário de cadastro (/conta/cadastro). Em erro, devolve a mensagem e o que foi digitado (sem a
 * senha). Em sucesso, abre a sessão e leva ao destino seguro (a sacola, se a pessoa veio dela).
 */
export async function registerAction(_prev: ClienteFormState, form: FormData): Promise<ClienteFormState> {
  // Limite por origem: 5 cadastros por hora (impede criar contas em série).
  const limite = await rateLimit("customer-register", await clientKey(), 5, 60 * MIN);
  if (!limite.allowed) return { error: "Muitos cadastros em pouco tempo. Tente de novo mais tarde.", values: seguros(form) };

  const lido = parseRegisterForm(form);
  if (!lido.ok) return { error: lido.error, values: seguros(form) };

  const criado = await registerCustomer(lido.data);
  if (!criado.ok) return { error: criado.error, values: seguros(form) };

  // Conta nova nasce com a versão de sessão 1.
  await startCustomerSession(criado.id, 1);
  redirect(safeNext(texto(form, "next")));
}

/**
 * Formulário de entrada (/conta/entrar). Passos: limite por origem → limite por e-mail → confere a
 * senha → abre a sessão. A mensagem de erro é sempre a mesma, para não revelar se o e-mail tem conta.
 */
export async function loginAction(_prev: ClienteFormState, form: FormData): Promise<ClienteFormState> {
  const email = texto(form, "email").trim().toLowerCase();
  const volta = { email: texto(form, "email") };

  // 1) Por origem: 8 tentativas a cada 15 minutos, qualquer que seja o e-mail.
  const porOrigem = await rateLimit("customer-login", await clientKey(), 8, 15 * MIN);
  if (!porOrigem.allowed) return { error: MUITAS_TENTATIVAS, values: volta };

  // 2) Por e-mail: 5 ERROS a cada 15 minutos, mesmo vindos de origens diferentes (quem tenta adivinhar a
  //    senha de uma conta pode trocar de endereço, mas não de e-mail). A chave guarda só um resumo do
  //    e-mail, nunca o endereço em claro. Reaproveita a contagem de falhas do painel (mesma tabela),
  //    com uma chave que começa com "cliente:" para as duas contagens nunca se misturarem.
  const chave = `cliente:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
  if (await isLockedOut(chave)) return { error: MUITAS_TENTATIVAS, values: volta };

  const entrou = await authenticate(email, texto(form, "password"));
  if (!entrou) {
    await registerFailure(chave);
    return { error: "E-mail ou senha incorretos.", values: volta };
  }

  await clearFailures(chave);
  await startCustomerSession(entrou.id, entrou.sessionVersion);
  // Para onde ir:
  //   - senha provisória: só pode trocá-la, antes de qualquer outra coisa;
  //   - destino pedido (a sacola, por exemplo): vale, depois de passar por safeNext (nunca outro site);
  //   - sem destino: o administrador vai ao painel e o cliente, à conta. É assim que o administrador chega ao
  //     painel: entrando pela tela de todo mundo, sem nenhum botão de "admin".
  if (entrou.mustChangePassword) redirect("/conta?trocar=1");
  const pedido = texto(form, "next");
  redirect(pedido ? safeNext(pedido) : entrou.role === "admin" ? "/admin" : "/conta");
}

/** Botão "Sair": encerra a sessão neste aparelho e volta à página inicial. */
export async function logoutAction(): Promise<void> {
  await endCustomerSession();
  redirect("/");
}

// ---------- Conta ----------

/**
 * Trocar a senha (/conta). Exige a senha atual. Depois de trocar, os OUTROS aparelhos são desconectados
 * (a versão da sessão avança) e este continua logado.
 */
export async function changePasswordAction(_prev: ClienteFormState, form: FormData): Promise<ClienteFormState> {
  // A única ação que quem tem senha provisória pode usar: é justamente a troca que ele precisa fazer.
  const cliente = await requireCustomer("/conta", { permitirSenhaProvisoria: true });

  // Quem roubou uma sessão não pode adivinhar a senha atual por aqui: 5 tentativas a cada 15 minutos por conta.
  const limite = await rateLimit("customer-password", String(cliente.id), 5, 15 * MIN);
  if (!limite.allowed) return { error: MUITAS_TENTATIVAS };

  const atual = texto(form, "current");
  const nova = texto(form, "next");
  if (nova !== texto(form, "confirm")) return { error: "A confirmação não confere com a nova senha." };
  const problema = validatePassword(nova, cliente.email);
  if (problema) return { error: problema };

  const r = await changePassword(cliente.id, atual, nova);
  if (r === "senha-atual") return { error: "A senha atual está incorreta." };
  if (r === "invalida") return { error: "A nova senha não é aceita. Escolha outra." };
  if (r === "conflito") return { error: "Sua conta mudou durante a troca. Tente de novo." };

  // Este aparelho continua logado com a versão nova da sessão. Aqui o horário do login É renovado, de propósito:
  // a pessoa acabou de provar a senha atual (é o que dá direito a um login novo).
  const depois = await getCustomer(cliente.id);
  if (depois) await startCustomerSession(depois.id, depois.sessionVersion);
  revalidatePath("/conta");
  return { ok: "Senha alterada. Os outros aparelhos foram desconectados." };
}

/** Botão "Sair de todos os aparelhos": derruba todas as sessões, menos esta. */
export async function signOutEverywhereAction(): Promise<void> {
  const cliente = await requireCustomer("/conta");
  // O horário do login atual, para NÃO renová-lo: "sair dos outros" não prova a senha, e renovar aqui deixaria um
  // cookie roubado manter o acesso ao painel indefinidamente.
  const loginOriginal = (await currentSession())?.iat;
  const versao = await signOutEverywhere(cliente.id);
  // Conta que sumiu no meio do caminho: volta à entrada em vez de abrir uma sessão que não vale.
  if (versao === 0) redirect("/conta/entrar");
  await startCustomerSession(cliente.id, versao, loginOriginal);
  revalidatePath("/conta");
}

/**
 * "Excluir minha conta". Exige a senha (um aparelho esquecido aberto não pode apagar a conta). A conta
 * é ANONIMIZADA: nome, e-mail e celular somem, os pedidos ficam (a loja precisa guardá-los).
 */
export async function deleteAccountAction(_prev: ClienteFormState, form: FormData): Promise<ClienteFormState> {
  const cliente = await requireCustomer("/conta", { permitirSenhaProvisoria: true });
  // Conta de administrador não se exclui por aqui: a loja poderia ficar sem ninguém para administrá-la. Quem
  // cuida do sistema remove o papel antes, pelo comando "npm run admin:remover".
  if (cliente.role === "admin") return { error: "Contas de administrador não podem ser excluídas por aqui." };

  const limite = await rateLimit("customer-delete", String(cliente.id), 5, 15 * MIN);
  if (!limite.allowed) return { error: MUITAS_TENTATIVAS };

  const senha = texto(form, "password");
  if (senha === "" || !(await authenticate(cliente.email, senha))) {
    return { error: "Senha incorreta. Nada foi apagado." };
  }

  await anonymizeCustomer(cliente.id);
  await endCustomerSession();
  redirect("/");
}
