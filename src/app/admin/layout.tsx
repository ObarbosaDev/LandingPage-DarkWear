// ============================================================================
// Layout de TODA a área do dono (/admin): a tela de login e as telas do painel.
//
// Fica separado do layout do site de propósito: o painel não tem o cabeçalho, o rodapé nem o carrinho
// da loja. Aqui só define o fundo escuro e esconde o painel dos buscadores.
// ============================================================================

import type { Metadata } from "next";

// O painel nunca deve aparecer em buscadores.
// "index: false" = não listar a página nos resultados; "follow: false" = não seguir os links dela.
export const metadata: Metadata = {
  // O "template" faz as abas aparecerem como "Pedidos · Painel DarkWear".
  title: { default: "Painel", template: "%s · Painel DarkWear" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
