// ============================================================================
// Página 404 GLOBAL: aparece quando o endereço não existe em lugar nenhum do projeto
// (ex.: /qualquer-coisa-errada). O Next usa este arquivo para endereços sem rota.
//
// Como este arquivo fica fora do grupo (site), o layout do site (cabeçalho, rodapé, carrinho) NÃO se
// aplica a ele automaticamente: por isso ele traz a própria moldura (SiteFrame). A 404 de uma PEÇA
// inexistente (/loja/<peça-que-não-existe>) é outra e fica em src/app/(site)/not-found.tsx.
// ============================================================================

import { NotFoundView } from "@/components/NotFoundView";
import { SiteFrame } from "@/components/SiteFrame";

// Atende endereço que não existe em lugar nenhum. Traz a própria moldura do site, porque aqui o layout
// do grupo (site) não se aplica. (Peça inexistente cai em (site)/not-found.tsx, que já está dentro da moldura.)
export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundView />
    </SiteFrame>
  );
}
