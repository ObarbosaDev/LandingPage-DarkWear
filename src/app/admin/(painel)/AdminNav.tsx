// ============================================================================
// Barra de navegação do painel (topo de todas as telas de /admin depois do login).
//
// Mostra os links entre as áreas (Painel, Pedidos, Encomendas, Produtos), um atalho "Ver a loja" e o
// botão "Sair". É componente de navegador porque precisa saber em qual endereço o dono está, para
// sublinhar o link da página atual.
// ============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/actions";

// As quatro áreas do painel, na ordem em que aparecem na barra.
const LINKS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/encomendas", label: "Encomendas" },
  { href: "/admin/produtos", label: "Produtos" },
];

export function AdminNav() {
  // Endereço atual (ex.: "/admin/pedidos"), usado para destacar o link ativo.
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <nav aria-label="Painel" className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <span className="font-display text-2xl uppercase">DarkWear</span>
          {LINKS.map((l) => {
            // "/admin" só está ativo na página inicial do painel; os demais valem também para as
            // telas internas (ex.: /admin/produtos/novo continua destacando "Produtos").
            const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`text-lg font-medium underline-offset-8 hover:underline ${active ? "underline" : ""}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-medium underline-offset-4 hover:underline">
            Ver a loja
          </Link>
          {/* "Sair" é um formulário (e não só um link) porque encerrar a sessão é uma AÇÃO do servidor:
              apaga o cookie e redireciona ao login. */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="border-2 border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-foreground hover:text-background"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
