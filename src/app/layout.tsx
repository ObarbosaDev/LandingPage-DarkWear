// ============================================================================
// Layout RAIZ: a "casca" de todas as páginas do projeto (site da loja e painel do dono).
//
// Define o que é comum a tudo: o <html> e o <body>, o idioma, as fontes e os estilos globais.
// Deliberadamente NÃO tem cabeçalho, rodapé nem carrinho: esses são do site e ficam em
// src/components/SiteFrame.tsx (usado por src/app/(site)/layout.tsx). Assim o painel /admin não
// herda a navegação da loja.
// ============================================================================

import type { Metadata } from "next";
import { Anton, Archivo, Geist_Mono } from "next/font/google";
// Estilos globais: cores da marca, tema do Tailwind e regras base.
import "./globals.css";
// Animações do site (revelação ao rolar, fundo tipográfico derivando).
import "./motion.css";
import { SITE } from "@/lib/site";

// As três fontes da marca, carregadas pelo Next (baixadas no build e servidas junto do site, sem
// pedir nada ao Google em tempo de execução). Cada uma cria uma variável CSS usada nos estilos:
//   Archivo    → texto corrido        Anton → títulos grandes        Geist Mono → rótulos pequenos
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Título e descrição padrão (aba do navegador e resultados de busca).
// O "template" faz cada página aparecer como "Loja · DarkWear", "FAQ · DarkWear" etc.
export const metadata: Metadata = {
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      // As variáveis das fontes ficam no <html> para todo o site poder usá-las; "antialiased"
      // deixa o texto mais suave.
      className={`${archivo.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      {/* id="topo": âncora do botão "voltar ao topo". O corpo é uma coluna que ocupa a tela toda,
          o que empurra o rodapé para baixo mesmo em páginas curtas. */}
      <body id="topo" className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
