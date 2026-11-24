// ============================================================================
// Layout de TODA a área do dono (/admin): a tela de login e as telas do painel.
//
// Fica separado do layout do site de propósito: o painel não tem o cabeçalho, o rodapé nem o carrinho
// da loja. Aqui só define o fundo escuro e esconde o painel dos buscadores.
// ============================================================================

import type { Metadata } from "next";

// O painel nunca deve aparecer em buscadores.
// "index: false" = não listar a página nos resultados; "follow: false" = não seguir os links dela.
// ATENÇÃO: este layout NÃO define título. Cada página do painel define o seu (absoluto). Se o layout
// definisse, o título "Painel" apareceria também na resposta "não encontrado" que um visitante comum recebe
// ao abrir /admin, entregando que existe um painel ali.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
