// ============================================================================
// Layout das telas do painel logado: o BASTIDORES da loja (resumo, esteira de pedidos, encomendas, prateleira
// de produtos e caderneta de clientes).
// "(painel)" é um grupo de rotas: a pasta não aparece no endereço, mas agrupa tudo o que exige um administrador.
//
// Faz duas coisas: confere que quem chega é um administrador com login recente (senão, "não encontrado") e
// monta o topo de todas as telas: a faixa que corre com o que espera pelo dono e a barra de navegação com o
// nome de quem está logado e os números de pedidos pendentes e encomendas novas.
// ============================================================================

import { Faixa } from "@/components/admin/Faixa";
import { itensDaFaixa } from "@/lib/ticker";
import { requireAdmin } from "@/server/admin/auth";
import { contagensDoPainel } from "@/server/admin/dashboard";
import { AdminNav } from "./AdminNav";

// Área privada: não precisa de casca estática instantânea. Ela bloqueia no servidor até validar a sessão.
export const instant = false;

// Tudo dentro de (painel) exige um administrador com login recente. A conferência acontece AQUI, antes de
// qualquer coisa ser enviada ao navegador (sem Suspense na frente): quem não é administrador recebe um "não
// encontrado" de verdade (status 404, sem título nem texto do painel), igual a qualquer endereço que não existe.
// Cada página e cada ação repetem a verificação por segurança.
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const contagens = await contagensDoPainel();
  return (
    <>
      <Faixa itens={itensDaFaixa(contagens)} />
      <AdminNav nome={admin.name} pedidos={contagens.pedidosPendentes} encomendas={contagens.encomendasNovas} />
      <main className="mx-auto max-w-7xl px-6 py-12">{children}</main>
    </>
  );
}
