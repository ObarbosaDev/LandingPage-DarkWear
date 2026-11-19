import { CartProvider } from "@/lib/cart";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

// Moldura da loja: cabeçalho, rodapé e carrinho. Usada pelas páginas do site e pela página 404.
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <BackToTop />
    </CartProvider>
  );
}
