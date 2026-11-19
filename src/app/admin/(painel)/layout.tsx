// ============================================================================
// Layout das telas do painel logado: resumo, pedidos, encomendas e produtos.
// "(painel)" é um grupo de rotas: a pasta não aparece no endereço, mas agrupa tudo o que exige
// sessão (a tela de login fica fora dele).
//
// Faz duas coisas: barra quem não tem sessão (redireciona ao login) e coloca a barra de navegação
// do painel no topo de todas as telas.
// ============================================================================

import { Suspense } from "react";
import { requireAdmin } from "@/server/admin/auth";
import { AdminNav } from "./AdminNav";

// Área privada: não precisa de casca estática instantânea. Ela bloqueia no servidor até validar a sessão.
export const instant = false;

// Tudo dentro de (painel) exige sessão. A leitura do cookie é dinâmica, então fica dentro de Suspense
// (exigência do Cache Components). Cada página e cada ação repetem a verificação por segurança.
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    // Enquanto o servidor confere a sessão, mostra "Carregando painel…" (nenhum dado do painel
    // aparece antes da conferência).
    <Suspense fallback={<p className="p-6 text-xl font-medium">Carregando painel…</p>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

/** O "porteiro": confere a sessão e só então desenha a navegação e o conteúdo. */
async function Gate({ children }: { children: React.ReactNode }) {
  // Sem sessão válida, esta chamada redireciona para /admin/login e o código abaixo nem executa.
  await requireAdmin();
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-7xl px-6 py-12">{children}</main>
    </>
  );
}
