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
