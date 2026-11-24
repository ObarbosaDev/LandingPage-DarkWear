// ============================================================================
// ACESSO AO PAINEL do dono (/admin): quem pode entrar.
//
// O painel NÃO tem senha própria nem tela de login. Quem administra a loja é uma CONTA comum com o papel
// "admin" (coluna customers.role, criada só por comando de terminal do dono: "npm run admin:criar"). Essa
// pessoa entra pela MESMA tela de todo mundo (/conta/entrar), com e-mail e senha pessoais, e a ação de entrar
// a leva ao painel. Não existe botão, link nem gesto de "admin" em nenhuma tela pública.
//
// Regras de segurança deste arquivo:
//   1. Quem não é administrador recebe "não encontrado" (404), igual a qualquer endereço que não existe: nada
//      indica que há um painel ali.
//   2. O login de administrador vale por 12 HORAS (o de cliente vale 30 dias). Passou disso, a pessoa entra de
//      novo. O horário do login (iat) não é renovado sem provar a senha (ver startCustomerSession).
//   3. Quem entrou com senha provisória só pode trocá-la: o painel fica fechado até a troca.
//   4. Toda página e toda ação do painel chamam requireAdmin(): uma ação pode ser chamada direto, sem passar
//      pela página, então esconder a tela não basta.
// ============================================================================

import "server-only";
import { notFound, redirect } from "next/navigation";
import type { CustomerView } from "@/server/customers";
import { currentSession } from "@/server/customers/session";

/** Quantas horas o login de um administrador abre o painel. */
export const SESSAO_ADMIN_HORAS = 12;

/** O login (iat) ainda está dentro da janela do painel? */
const recente = (iat: number) => Date.now() - iat < SESSAO_ADMIN_HORAS * 3600 * 1000;

/** Diz se quem está chamando é um administrador com login recente e sem troca de senha pendente. */
export async function isAdmin(): Promise<boolean> {
  const s = await currentSession();
  return Boolean(s && s.customer.role === "admin" && !s.customer.mustChangePassword && recente(s.iat));
}

/**
 * Chame no início de toda página e ação do painel. Devolve o administrador, ou não devolve: lança
 * "não encontrado" (para quem não é administrador) ou redireciona (para trocar a senha provisória ou entrar de
 * novo depois das 12 horas).
 */
export async function requireAdmin(): Promise<CustomerView> {
  const s = await currentSession();
  // Anônimo, cliente comum, conta anonimizada ou cookie antigo: 404, sem nenhuma pista.
  if (!s || s.customer.role !== "admin") notFound();
  if (s.customer.mustChangePassword) redirect("/conta?trocar=1");
  // Administrador de verdade, mas com login antigo: pede para entrar de novo (a tela de entrar aceita
  // "reentrar" mesmo com a sessão aberta).
  if (!recente(s.iat)) redirect("/conta/entrar?reentrar=1");
  return s.customer;
}
