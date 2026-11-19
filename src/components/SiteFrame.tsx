// ============================================================================
// "Moldura" do site da loja: tudo o que se repete em todas as páginas que o CLIENTE vê.
//
// Compõe, de cima para baixo: o provedor do carrinho (para qualquer página acessar a sacola), o
// cabeçalho, o conteúdo da página, o rodapé e o botão flutuante "voltar ao topo".
//
// Quem usa: o layout do grupo (site) e a página 404 global. O painel do dono (/admin) NÃO usa esta
// moldura: ele tem a própria navegação.
// ============================================================================

import { CartProvider } from "@/lib/cart";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

// Moldura da loja: cabeçalho, rodapé e carrinho. Usada pelas páginas do site e pela página 404.
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    // O CartProvider fica por fora de tudo para que o cabeçalho (contador da sacola) e as páginas
    // (adicionar/ver itens) compartilhem o MESMO carrinho.
    <CartProvider>
      <Header />
      {/* flex-1: o conteúdo cresce para ocupar o espaço livre, empurrando o rodapé para o fim da tela. */}
      <main className="flex-1">{children}</main>
      <Footer />
      <BackToTop />
    </CartProvider>
  );
}
