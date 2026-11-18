import type { Metadata } from "next";
import { Anton, Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./motion.css";
import { CartProvider } from "@/lib/cart";
import { SITE } from "@/lib/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body id="topo" className="flex min-h-full flex-col">
        {/* Filtro SVG usado pela tipografia grafitada: quebra a borda do texto */}
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <filter id="graffiti-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <BackToTop />
        </CartProvider>
      </body>
    </html>
  );
}
