// ============================================================================
// Tela de clientes do painel: /admin/clientes. A ideia: a CADERNETA, a agenda de contatos da loja.
//
// Os clientes aparecem agrupados pela inicial do nome (A, B, C...), cada grupo com a letra em tamanho gigante
// ao lado, como numa agenda telefônica de papel, com linhas pontilhadas entre os contatos. Em cada contato: o
// nome, há quanto tempo é cliente, o e-mail, o celular (com link para chamar no WhatsApp), quantos pedidos fez e
// quanto já gastou. Um índice de letras no topo leva direto a cada grupo.
//
// Dá para BUSCAR por nome, e-mail ou celular e gerar uma senha provisória para quem esqueceu a senha (ainda
// não há recuperação por e-mail). Administradores aparecem marcados e NÃO têm botão de senha: eles são geridos só
// pelo comando de terminal (npm run admin:criar, admin:senha, admin:remover). O painel nunca concede nem retira
// esse papel.
//
// De onde vêm os dados: listCustomers (src/server/admin/customers.ts), que nunca devolve a senha.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { agruparPorInicial } from "@/lib/grouping";
import { formatCents } from "@/lib/money";
import { tempoRelativo } from "@/lib/relative-time";
import { clienteWhatsappLink } from "@/lib/whatsapp";
import { requireAdmin } from "@/server/admin/auth";
import { CLIENTES_POR_PAGINA, contarClientes, listCustomers } from "@/server/admin/customers";
import { SenhaProvisoria } from "./SenhaProvisoria";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Caderneta · Painel DarkWear" } };

/** "11987654321" → "(11) 98765-4321". */
function celular(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; pagina?: string }> }) {
  await requireAdmin();
  const { q: qBruto, pagina: paginaBruta } = await searchParams;
  // A busca vem do endereço: só texto, no máximo 80 caracteres.
  const q = (Array.isArray(qBruto) ? qBruto[0] : qBruto)?.slice(0, 80) ?? "";
  const pagina = Number.isInteger(Number(paginaBruta)) && Number(paginaBruta) >= 1 ? Number(paginaBruta) : 1;
  const [clientes, total] = await Promise.all([listCustomers(q, pagina), contarClientes(q)]);
  const paginas = Math.max(1, Math.ceil(total / CLIENTES_POR_PAGINA));
  const linkPagina = (p: number) => `/admin/clientes?${q ? `q=${encodeURIComponent(q)}&` : ""}pagina=${p}`;
  const grupos = agruparPorInicial(clientes);

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Relacionamento"
        titulo="Caderneta"
        descricao="Todo mundo que tem conta na loja, por ordem alfabética. Para dar acesso ao painel a alguém, use o comando admin:criar no terminal."
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
        <>
          {/* O índice da caderneta: uma letra por grupo, cada uma leva ao seu grupo. */}
          <nav aria-label="Índice da caderneta" className="flex flex-wrap gap-2">
            {grupos.map((g) => (
              <a
                key={g.letra}
                href={`#letra-${g.letra === "#" ? "outros" : g.letra}`}
                className="flex h-11 w-11 items-center justify-center border-2 border-foreground font-display text-2xl leading-none transition-colors hover:bg-foreground hover:text-background"
              >
                {g.letra}
              </a>
            ))}
            <span className="flex items-center pl-3 font-mono text-sm font-bold">
              {total} {total === 1 ? "contato" : "contatos"}
            </span>
          </nav>

          <div className="flex flex-col">
            {grupos.map((g) => (
              <section key={g.letra} id={`letra-${g.letra === "#" ? "outros" : g.letra}`} className="grid gap-x-10 border-t-2 border-foreground py-8 lg:grid-cols-[9rem_1fr]">
                {/* A letra do grupo, gigante, como a orelha de uma agenda. */}
                <h2 className="font-display text-[clamp(5rem,12vw,9rem)] uppercase leading-[0.8]" aria-label={`Clientes com a inicial ${g.letra}`}>
                  {g.letra}
                </h2>

                <ul className="mt-4 lg:mt-0">
                  {g.itens.map((c) => {
                    const zap = clienteWhatsappLink(c.phone, `Olá, ${c.name.split(" ")[0]}! Aqui é da DarkWear.`);
                    return (
                      <li key={c.id} className="border-b-2 border-dotted border-foreground py-5 first:pt-0 last:border-b-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                          <p className="flex flex-wrap items-center gap-3 font-display text-4xl uppercase leading-none">
                            {c.name}
                            {c.role === "admin" && (
                              <span className="bg-foreground px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.12em] text-background">Administrador</span>
                            )}
                            {c.mustChangePassword && (
                              <span className="border-2 border-foreground px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.12em]">Senha provisória</span>
                            )}
                          </p>
                          <span className="font-mono text-xs font-bold uppercase tracking-[0.12em]">cliente {tempoRelativo(c.createdAt)}</span>
                        </div>

                        <dl className="mt-3 grid gap-x-8 gap-y-1 text-lg font-medium sm:grid-cols-2">
                          <div>
                            <dt className="font-mono text-xs font-bold uppercase tracking-[0.12em]">E-mail</dt>
                            <dd className="break-all">{c.email}</dd>
                          </div>
                          <div>
                            <dt className="font-mono text-xs font-bold uppercase tracking-[0.12em]">Celular</dt>
                            <dd>
                              {zap ? (
                                <a href={zap} className="underline underline-offset-4">
                                  {celular(c.phone)} · chamar
                                </a>
                              ) : (
                                celular(c.phone)
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-mono text-xs font-bold uppercase tracking-[0.12em]">Pedidos</dt>
                            <dd>
                              {c.pedidos > 0 ? (
                                <Link href={`/admin/pedidos?q=${encodeURIComponent(c.email)}`} className="underline underline-offset-4">
                                  {c.pedidos} {c.pedidos === 1 ? "pedido" : "pedidos"}
                                </Link>
                              ) : (
                                "Nenhum ainda"
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-mono text-xs font-bold uppercase tracking-[0.12em]">Já gastou</dt>
                            <dd>{formatCents(c.gastoCents)}</dd>
                          </div>
                        </dl>

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
              </section>
            ))}
          </div>

          {/* Mais de uma página: anterior, qual página é e próxima (a busca é mantida). */}
          {paginas > 1 ? (
            <nav aria-label="Páginas" className="flex flex-wrap items-center gap-4 border-t-2 border-foreground pt-6 font-mono text-sm font-bold uppercase">
              {pagina > 1 ? (
                <Link href={linkPagina(pagina - 1)} className="underline underline-offset-4">
                  ← Anterior
                </Link>
              ) : null}
              <span>
                Página {pagina} de {paginas}
              </span>
              {pagina < paginas ? (
                <Link href={linkPagina(pagina + 1)} className="underline underline-offset-4">
                  Próxima →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
