// ============================================================================
// CLIENTES vistos pelo DONO: a lista de /admin/clientes e a senha provisória.
//
// Quem usa: a tela /admin/clientes e a ação resetCustomerPasswordAction (src/app/admin/actions.ts).
// O cliente se vê pelo próprio módulo de contas (src/server/customers); aqui é a visão de quem administra.
//
// Regras:
//   - nunca devolve o hash da senha;
//   - não lista contas anonimizadas (o cliente que excluiu a conta saiu da lista de propósito);
//   - a busca trata o que foi digitado como TEXTO: "%" e "_" não são curingas e nada é colado em SQL;
//   - a senha provisória NUNCA vale para administradores: eles são geridos só pelo comando de terminal do
//     dono (npm run admin:senha), para o painel nunca poder tomar a conta de quem administra.
// ============================================================================

import "server-only";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, orders } from "@/server/db/schema";
import { getCustomer, setTemporaryPassword } from "@/server/customers";

/** Uma linha da lista de clientes. */
export type AdminCustomer = {
  id: number;
  name: string;
  email: string;
  /** Só dígitos (DDD + número). */
  phone: string;
  role: "cliente" | "admin";
  mustChangePassword: boolean;
  createdAt: Date;
  /** Quantos pedidos a pessoa já fez (de qualquer status). */
  pedidos: number;
  /** Quanto já gastou, em centavos: só pedidos pagos, enviados ou entregues. */
  gastoCents: number;
};

/**
 * Transforma o que foi digitado num padrão de ILIKE que acha o texto como ele é: a barra invertida, o "%" e o
 * "_" são escapados, então "50%" procura mesmo por "50%" e não por "50 e qualquer coisa".
 */
export function padraoContem(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Os clientes ativos, do mais novo para o mais antigo (CLIENTES_POR_PAGINA por página), com a quantidade de pedidos e o total
 * gasto. A busca (opcional) acha por parte do nome, do e-mail ou do celular (a máscara do celular não atrapalha).
 */
export async function listCustomers(busca?: string, pagina = 1): Promise<AdminCustomer[]> {
  const db = await getDb();
  const condicoes = condicoesDeClientes(busca);
  // Página inválida (zero, negativa, texto) vira a primeira.
  const deslocamento = Number.isInteger(pagina) && pagina > 1 ? (pagina - 1) * CLIENTES_POR_PAGINA : 0;

  return db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      role: customers.role,
      mustChangePassword: customers.mustChangePassword,
      createdAt: customers.createdAt,
      pedidos: sql<number>`count(${orders.id})::int`,
      gastoCents: sql<number>`coalesce(sum(case when ${orders.status} in ('pago', 'enviado', 'entregue') then ${orders.totalCents} else 0 end), 0)::int`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(and(...condicoes))
    .groupBy(customers.id)
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .limit(CLIENTES_POR_PAGINA)
    .offset(deslocamento);
}

/** Quantos clientes a lista tem por página (do mais novo para o mais antigo). */
export const CLIENTES_POR_PAGINA = 100;

/** Quantos clientes ativos batem com a busca (todos, não só os da página), para a paginação. */
export async function contarClientes(busca?: string): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(and(...condicoesDeClientes(busca)));
  return r.n;
}

/** As condições da lista de clientes: só contas ativas, e a busca por nome, e-mail ou celular (se houver). */
function condicoesDeClientes(busca?: string): SQL[] {
  const termo = typeof busca === "string" ? busca.trim() : "";
  const condicoes: SQL[] = [isNull(customers.anonymizedAt)];
  if (termo) {
    const padrao = padraoContem(termo);
    const digitos = termo.replace(/\D/g, "");
    const achar = [ilike(customers.name, padrao), ilike(customers.email, padrao)];
    // Só procura no celular se há dígitos suficientes para ser um pedaço de número (evita casar tudo com "1").
    if (digitos.length >= 3) achar.push(ilike(customers.phone, padraoContem(digitos)));
    condicoes.push(or(...achar) as SQL);
  }
  return condicoes;
}

/**
 * Gera uma senha provisória para um CLIENTE (esqueceu a senha, e ainda não há recuperação por e-mail).
 * Devolve a senha em texto, para o painel mostrá-la UMA vez; a pessoa é obrigada a trocá-la no próximo login.
 * @throws Error se a conta não existe, foi excluída ou é de administrador
 */
export async function resetCustomerPassword(id: number): Promise<string> {
  const cliente = await getCustomer(id);
  if (!cliente) throw new Error("Cliente não encontrado.");
  if (cliente.role === "admin") throw new Error("Contas de administrador só se gerenciam pelo comando de terminal (npm run admin:senha).");
  return setTemporaryPassword(cliente.id);
}
