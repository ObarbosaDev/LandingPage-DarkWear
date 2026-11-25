// ============================================================================
// robots.txt: as "regras da casa" para os robôs de busca (Google etc.). O Next gera o arquivo
// /robots.txt a partir desta função.
//
// O que diz: pode ler o site todo, EXCETO a API (/api) e as telas da conta do cliente (/conta); e onde
// está o mapa do site (sitemap.xml).
//
// O painel do dono (/admin) NÃO aparece aqui DE PROPÓSITO: listar o caminho num arquivo público seria
// entregar onde fica a porta. Ele continua fora dos buscadores pelo "noindex" em src/app/admin/layout.tsx
// e é protegido pela senha. Importante: robots.txt é um pedido educado, não uma proteção.
// ============================================================================

import type { MetadataRoute } from "next";
import { siteBase } from "@/lib/seo";

// A API e a conta do cliente não devem aparecer em buscadores.
export default function robots(): MetadataRoute.Robots {
  // Endereço público do site (variável SITE_URL); sem ela, o endereço local de desenvolvimento.
  const base = siteBase();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api", "/conta", "/carrinho", "/pagamento"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
