// ============================================================================
// Página "não encontrado" para peças que não existem ou foram ocultas pelo dono.
// É usada quando uma página do site chama notFound() (por exemplo /loja/<peça-inexistente>) e já
// aparece dentro do layout do site (com cabeçalho e rodapé). Endereços que não existem em lugar
// nenhum são atendidos por src/app/not-found.tsx, que traz a própria moldura.
// ============================================================================

import { NotFoundView } from "@/components/NotFoundView";

// Peça que não existe ou está oculta (notFound() nas páginas do site). Já vem dentro do layout do site.
export default function NotFound() {
  return <NotFoundView />;
}
