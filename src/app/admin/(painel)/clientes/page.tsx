// ============================================================================
// Tela de clientes do painel: /admin/clientes.
//
// O que o dono faz aqui: ver quem tem conta na loja (nome, e-mail, celular, quantos pedidos fez e quanto já
// gastou), BUSCAR por nome, e-mail ou celular, chamar o cliente no WhatsApp e gerar uma senha provisória para
// quem esqueceu a senha (ainda não há recuperação por e-mail).
//
// Administradores aparecem marcados e NÃO têm botão de senha: eles são geridos só pelo comando de terminal
// (npm run admin:criar, admin:senha, admin:remover). O painel nunca concede nem retira esse papel.
//
// De onde vêm os dados: listCustomers (src/server/admin/customers.ts), que nunca devolve a senha.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { formatCents } from "@/lib/money";
import { clienteWhatsappLink } from "@/lib/whatsapp";
import { requireAdmin } from "@/server/admin/auth";
import { listCustomers } from "@/server/admin/customers";
import { SenhaProvisoria } from "./SenhaProvisoria";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Clientes · Painel DarkWear" } };

const dataBr = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" });

/** "11987654321" → "(11) 98765-4321". */
function celular(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdmin();
  const { q: qBruto } = await searchParams;
  // A busca vem do endereço: só texto, no máximo 80 caracteres.
  const q = (Array.isArray(qBruto) ? qBruto[0] : qBruto)?.slice(0, 80) ?? "";
  const clientes = await listCustomers(q);

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Relacionamento"
        titulo="Clientes"
        descricao="Quem tem conta na loja. Para dar acesso ao painel a alguém, use o comando admin:criar no terminal."
        acoes={
          <form action="/admin/clientes" method="get" role="search" className="flex flex-wrap items-center gap-2">
            <label htmlFor="busca-clientes" className="sr-only">
              Buscar cliente
            </label>
            <input
              id="busca-clientes"
              name="q"
              defaultValue={q}
              maxLength={80}
              placeholder="Nome, e-mail ou celular"
              className="w-72 max-w-full border-2 border-foreground bg-transparent px-4 py-2.5 text-base font-medium text-foreground outline-none placeholder:text-foreground/70 focus:bg-foreground focus:text-background focus:placeholder:text-background/70"
            />
            <button type="submit" className="border-2 border-foreground bg-foreground px-5 py-2.5 text-base font-bold text-background transition-colors hover:bg-transparent hover:text-foreground">
              Buscar
            </button>
            {q ? (
              <Link href="/admin/clientes" className="text-base font-medium underline underline-offset-4">
                Limpar
              </Link>
            ) : null}
          </form>
        }
      />

      {clientes.length === 0 ? (
        <p className="text-xl font-medium">{q ? `Nenhum cliente encontrado para "${q}".` : "Ainda não há clientes cadastrados."}</p>
      ) : (
        <ul className="flex flex-col">
          {/* Cabeçalho da tabela: só em telas largas. No celular, cada cliente vira um bloco com os rótulos dentro. */}
          <li aria-hidden="true" className="hidden grid-cols-[2fr_2fr_1.4fr_0.7fr_1fr_1fr] gap-4 border-b-2 border-foreground pb-3 font-mono text-xs font-bold uppercase tracking-[0.15em] lg:grid">
            <span>Cliente</span>
            <span>E-mail</span>
            <span>Celular</span>
            <span>Pedidos</span>
            <span>Gasto</span>
            <span>Desde</span>
          </li>
          {clientes.map((c) => {
            const zap = clienteWhatsappLink(c.phone, `Olá, ${c.name.split(" ")[0]}! Aqui é da DarkWear.`);
            return (
              <li key={c.id} className="border-b-2 border-foreground py-5">
                <div className="grid gap-x-4 gap-y-2 text-lg font-medium lg:grid-cols-[2fr_2fr_1.4fr_0.7fr_1fr_1fr] lg:items-center">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {c.name}
                    {c.role === "admin" && <span className="border-2 border-foreground px-2 py-0.5 font-mono text-xs uppercase tracking-[0.12em]">Administrador</span>}
                    {c.mustChangePassword && <span className="border-2 border-foreground bg-foreground px-2 py-0.5 font-mono text-xs uppercase tracking-[0.12em] text-background">Senha provisória</span>}
                  </p>
                  <p className="break-all">
                    <span className="mr-2 font-mono text-xs uppercase tracking-[0.12em] lg:hidden">E-mail</span>
                    {c.email}
                  </p>
                  <p>
                    <span className="mr-2 font-mono text-xs uppercase tracking-[0.12em] lg:hidden">Celular</span>
                    {zap ? (
                      <a href={zap} className="underline underline-offset-4">
                        {celular(c.phone)}
                      </a>
                    ) : (
                      celular(c.phone)
                    )}
                  </p>
                  <p>
                    <span className="mr-2 font-mono text-xs uppercase tracking-[0.12em] lg:hidden">Pedidos</span>
                    {c.pedidos > 0 ? (
                      <Link href={`/admin/pedidos?q=${encodeURIComponent(c.email)}`} className="underline underline-offset-4">
                        {c.pedidos}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </p>
                  <p>
                    <span className="mr-2 font-mono text-xs uppercase tracking-[0.12em] lg:hidden">Gasto</span>
                    {formatCents(c.gastoCents)}
                  </p>
                  <p>
                    <span className="mr-2 font-mono text-xs uppercase tracking-[0.12em] lg:hidden">Desde</span>
                    {dataBr.format(c.createdAt)}
                  </p>
                </div>
                {/* Administrador não tem botão de senha: só o comando de terminal mexe nele. */}
                {c.role !== "admin" && (
                  <div className="mt-4">
                    <SenhaProvisoria id={c.id} nome={c.name} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
