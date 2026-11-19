import { CartProvider } from "@/lib/cart";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

// Moldura da loja: cabeçalho, rodapé e carrinho. O painel do dono (/admin) não usa isto.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <BackToTop />
    </CartProvider>
  );
}
