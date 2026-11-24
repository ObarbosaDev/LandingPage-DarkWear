// ============================================================================
// Barra de navegação do painel (topo de todas as telas de /admin).
//
// Duas linhas: em cima, a marca "DarkWear · Painel", quem está logado e os atalhos (ver a loja, sair); embaixo,
// os links entre as áreas, com um numerozinho nos que têm algo esperando (pedidos pendentes, encomendas novas).
// No celular a linha de links rola para o lado em vez de quebrar em várias linhas.
//
// É componente de navegador porque precisa saber em qual endereço o administrador está, para destacar o link da
// página atual. Os números e o nome chegam prontos do servidor (ver layout.tsx).
// ============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions-cliente";

// As áreas do painel, na ordem em que aparecem. "contagem" diz qual número aparece ao lado, se houver.
const LINKS = [
  { href: "/admin", label: "Painel", contagem: null },
  { href: "/admin/pedidos", label: "Pedidos", contagem: "pedidos" },
  { href: "/admin/encomendas", label: "Encomendas", contagem: "encomendas" },
  { href: "/admin/produtos", label: "Produtos", contagem: null },
  { href: "/admin/clientes", label: "Clientes", contagem: null },
] as const;

export function AdminNav({ nome, pedidos, encomendas }: { nome: string; pedidos: number; encomendas: number }) {
  // Endereço atual (ex.: "/admin/pedidos"), usado para destacar o link ativo.
  const pathname = usePathname();
  const numeros = { pedidos, encomendas };

  return (
    <header className="border-b-2 border-foreground">
      {/* Linha de cima: marca, quem está logado, atalhos. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-3xl uppercase leading-none">DarkWear</span>
          <span className="border-2 border-foreground px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.18em]">Painel</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-mono text-sm font-bold" title="Conta logada">
            {nome}
          </span>
          <Link href="/" className="text-base font-medium underline underline-offset-4">
            Ver a loja
          </Link>
          {/* "Sair" é um formulário (e não só um link) porque encerrar a sessão é uma AÇÃO do servidor:
              apaga o cookie e volta à página inicial da loja. */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="border-2 border-foreground px-4 py-1.5 text-base font-medium transition-colors hover:bg-foreground hover:text-background"
            >
              Sair
            </button>
          </form>
        </div>
      </div>

      {/* Linha de baixo: as áreas do painel. overflow-x-auto: no celular rola para o lado. */}
      <nav aria-label="Painel" className="border-t-2 border-foreground">
        <ul className="mx-auto flex max-w-7xl overflow-x-auto px-6">
          {LINKS.map((l) => {
            // "/admin" só está ativo na página inicial do painel; os demais valem também para as telas internas
            // (ex.: /admin/produtos/novo continua destacando "Produtos").
            const ativo = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            const n = l.contagem ? numeros[l.contagem] : 0;
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`flex items-center gap-2 border-b-4 px-4 py-3 font-display text-2xl uppercase leading-none transition-colors ${
                    ativo ? "border-foreground" : "border-transparent hover:border-foreground"
                  }`}
                >
                  {l.label}
                  {n > 0 && (
                    <span className="min-w-6 bg-foreground px-1.5 py-0.5 text-center font-mono text-xs font-bold text-background" aria-label={`${n} esperando`}>
                      {n}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
