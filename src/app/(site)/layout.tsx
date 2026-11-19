// ============================================================================
// Layout do SITE da loja: tudo que o cliente vê (home, loja, produto, personalizar, sacola, sobre,
// faq e contato).
//
// "(site)" é um grupo de rotas: a pasta não aparece no endereço (a loja é /loja, não /site/loja),
// mas separa as páginas da loja das do painel (/admin). Aqui só se aplica a moldura do site
// (cabeçalho, rodapé, carrinho), que está em src/components/SiteFrame.tsx.
// ============================================================================

import { SiteFrame } from "@/components/SiteFrame";

// O painel do dono (/admin) não usa esta moldura.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
