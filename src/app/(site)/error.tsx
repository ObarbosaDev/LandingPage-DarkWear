// ============================================================================
// Tela de erro das páginas do SITE: aparece quando algo inesperado quebra ao montar uma página
// (por exemplo, o banco fora do ar). Em vez de uma tela em branco, o cliente vê uma mensagem amigável
// com o botão "Tentar de novo". O visual fica em src/components/ErrorView.tsx (compartilhado com o painel).
//
// O Next exige que arquivos "error.tsx" sejam componentes de navegador ("use client").
// ============================================================================

"use client";

import { ErrorView } from "@/components/ErrorView";

// "error" é o erro ocorrido; "reset" tenta desenhar a página de novo (botão "Tentar de novo").
export default function SiteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
