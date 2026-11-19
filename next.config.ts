// ============================================================================
// Configuração do Next.js (o framework do site). Lida na subida e no build.
// ============================================================================

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Cache Components: o modelo de cache do Next 16. Permite que a maior parte de cada página seja
  // pré-gerada (rápida) e só as partes que dependem do momento (busca, sessão, estoque) sejam
  // calculadas na hora. É o que torna válidas as diretivas "use cache" do catálogo.
  cacheComponents: true,
  // Postgres embutido (só em desenvolvimento): não deve ser empacotado.
  // O PGlite carrega arquivos próprios em tempo de execução; empacotá-lo junto do código quebraria.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Pré-carrega, nos links visíveis, apenas a parte estática das páginas: a navegação parece instantânea.
  partialPrefetching: true,
  // Processamento do CSS pelo Turbopack (o empacotador do Next): arquivos .css passam pelo Tailwind.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
