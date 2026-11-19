// ============================================================================
// Tela de erro de ÚLTIMO RECURSO: só aparece se o próprio layout raiz do projeto quebrar (algo raro).
// Os erros normais são tratados por src/app/(site)/error.tsx e src/app/admin/error.tsx.
//
// Como o layout raiz (que define <html> e <body>) falhou, esta tela precisa trazer os seus próprios
// <html> e <body>. Por isso usa estilos "inline" simples (style={{...}}) em vez das classes do
// projeto: nem o CSS global está garantido neste ponto.
// ============================================================================

"use client";

// Último recurso: erro no próprio layout raiz. Precisa trazer o seu html e body, com estilo mínimo.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ background: "#000", color: "#fff", fontFamily: "sans-serif", padding: "4rem 1.5rem" }}>
        <h1 style={{ fontSize: "3rem", margin: 0 }}>Algo deu errado</h1>
        <p style={{ fontSize: "1.25rem", maxWidth: "28rem" }}>Não foi possível carregar o site agora. Tente de novo.</p>
        {/* "reset" tenta montar a página de novo. */}
        <button
          type="button"
          onClick={reset}
          style={{ border: "2px solid #fff", background: "#fff", color: "#000", padding: "0.75rem 1.75rem", fontSize: "1.25rem", cursor: "pointer" }}
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
