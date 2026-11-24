// ============================================================================
// Barra de navegação do painel (abaixo da faixa, no topo de todas as telas de /admin).
//
// A ideia: é a MESMA linguagem do cabeçalho da loja (palavras grandes em letras condensadas, com o número do
// item em cima, estilo índice de revista), só que com o selo "Bastidores": o painel é o outro lado da loja.
// Em cima, a marca, quem está logado e os atalhos; embaixo, as áreas, com um numerozinho nas que têm algo
// esperando (pedidos pendentes, encomendas novas). No celular a linha de áreas rola para o lado.
//
// É componente de navegador porque precisa saber em qual endereço o administrador está, para sublinhar o link da
// página atual. Os números e o nome chegam prontos do servidor (ver layout.tsx).
// ============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions-cliente";

// As áreas do painel, na ordem em que aparecem. "contagem" diz qual número aparece ao lado, se houver.
const LINKS = [
  { href: "/admin", label: "Painel", contagem: null },
  { href: "/admin/pedidos", label: "Esteira", contagem: "pedidos" },
  { href: "/admin/encomendas", label: "Encomendas", contagem: "encomendas" },
  { href: "/admin/produtos", label: "Prateleira", contagem: null },
  { href: "/admin/clientes", label: "Caderneta", contagem: null },
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
          <span className="font-display text-4xl uppercase leading-none">DarkWear</span>
          <span className="bg-foreground px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-background">Bastidores</span>
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

      {/* Linha de baixo: as áreas do painel, com o número do item como no cabeçalho da loja. */}
      <nav aria-label="Painel" className="border-t-2 border-foreground">
        <ul className="mx-auto flex max-w-7xl overflow-x-auto px-6">
          {LINKS.map((l, i) => {
            // "/admin" só está ativo na página inicial do painel; os demais valem também para as telas internas
            // (ex.: /admin/produtos/novo continua destacando "Prateleira").
            const ativo = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            const n = l.contagem ? numeros[l.contagem] : 0;
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`group flex items-start gap-1.5 border-b-4 px-5 py-3 font-display text-3xl uppercase leading-none transition-colors ${
                    ativo ? "border-foreground bg-foreground text-background" : "border-transparent hover:border-foreground"
                  }`}
                >
                  <span className="font-mono text-[10px] font-bold leading-none">{String(i + 1).padStart(2, "0")}</span>
                  {l.label}
                  {n > 0 && (
                    <span
                      className={`min-w-6 px-1.5 py-0.5 text-center font-mono text-xs font-bold leading-none ${ativo ? "bg-background text-foreground" : "bg-foreground text-background"}`}
                      aria-label={`${n} esperando`}
                    >
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
