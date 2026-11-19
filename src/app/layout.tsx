import type { Metadata } from "next";
import { Anton, Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./motion.css";
import { SITE } from "@/lib/site";

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
        {children}
      </body>
    </html>
  );
}
