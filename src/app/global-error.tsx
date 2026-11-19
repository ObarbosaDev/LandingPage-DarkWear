"use client";

// Último recurso: erro no próprio layout raiz. Precisa trazer o seu html e body, com estilo mínimo.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ background: "#000", color: "#fff", fontFamily: "sans-serif", padding: "4rem 1.5rem" }}>
        <h1 style={{ fontSize: "3rem", margin: 0 }}>Algo deu errado</h1>
        <p style={{ fontSize: "1.25rem", maxWidth: "28rem" }}>Não foi possível carregar o site agora. Tente de novo.</p>
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
