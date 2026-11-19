// ============================================================================
// robots.txt: as "regras da casa" para os robôs de busca (Google etc.). O Next gera o arquivo
// /robots.txt a partir desta função.
//
// O que diz: pode ler o site todo, EXCETO o painel do dono (/admin) e a API (/api); e onde está o
// mapa do site (sitemap.xml). Importante: robots.txt é um pedido educado, não uma proteção. A
// proteção do painel é a senha; o "noindex" em src/app/admin/layout.tsx reforça isso.
// ============================================================================

import type { MetadataRoute } from "next";

// O painel e a API não devem aparecer em buscadores.
export default function robots(): MetadataRoute.Robots {
  // Endereço público do site (variável SITE_URL); sem ela, o endereço local de desenvolvimento.
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
