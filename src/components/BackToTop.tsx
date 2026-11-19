// ============================================================================
// Botão flutuante "voltar ao topo": aparece no canto da tela depois de rolar bastante a página e,
// ao clicar, leva ao início com uma rolagem suave. Útil nas páginas longas (home, sobre).
// Faz parte da moldura do site (SiteFrame).
// ============================================================================

"use client";

import { useEffect, useState } from "react";

// Ícone flutuante que aparece depois de descer a página e volta ao topo com rolagem suave.
export function BackToTop() {
  // true quando já rolou o bastante para o botão fazer sentido.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Só mostra depois de 500 px de rolagem (quase uma tela inteira).
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // Quando escondido, o botão fica transparente, deslocado e sem receber cliques (pointer-events-none);
    // assim não atrapalha nem é alcançado por engano. A transição faz ele "subir" ao aparecer.
    <button
      type="button"
      aria-label="Voltar ao topo"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center border-2 border-foreground bg-background text-foreground transition-all duration-300 hover:bg-foreground hover:text-background ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      {/* Seta para cima desenhada em SVG. */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
