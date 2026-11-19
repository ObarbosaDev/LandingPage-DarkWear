// ============================================================================
// LUPA da foto na página de uma peça (/loja/[slug]).
//
// Ao passar o mouse sobre a foto, ela é AMPLIADA (2,6x) no ponto exato do cursor, para o cliente ver
// o detalhe da estampa de perto. Ao tirar o mouse, volta ao normal. Em telas de toque não há zoom:
// a foto aparece inteira.
//
// Recebe a foto como "children" (a foto é desenhada no servidor, em ProductImage), e este componente
// só cuida do efeito de ampliar. É de navegador porque acompanha o movimento do mouse.
// ============================================================================

"use client";

import { useState, type ReactNode } from "react";

// Lupa: com o mouse sobre a foto, ela amplia no ponto do cursor para ver o detalhe da estampa.
// Em tela de toque a foto fica inteira, sem zoom.
export function ProductZoom({ children }: { children: ReactNode }) {
  // O ponto (em % da largura e da altura da foto) onde o mouse está; null = mouse fora da foto.
  const [alvo, setAlvo] = useState<{ x: number; y: number } | null>(null);

  /** Acompanha o mouse sobre a foto e guarda a posição dele em porcentagem. */
  function mover(e: React.PointerEvent<HTMLDivElement>) {
    // Dedo/caneta não ativam a lupa: só o mouse (o dedo "arrastaria" a página, não pairaria sobre ela).
    if (e.pointerType !== "mouse") return;
    // getBoundingClientRect dá a posição e o tamanho da foto na tela; com ele, convertemos a
    // posição do mouse (em pixels da tela) em porcentagem dentro da foto.
    const r = e.currentTarget.getBoundingClientRect();
    setAlvo({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  }

  return (
    // overflow-hidden: a parte ampliada que passa da moldura é cortada, então só se vê o "recorte"
    // da foto ao redor do cursor. cursor-zoom-in mostra a lupa no ponteiro do mouse.
    <div
      onPointerMove={mover}
      onPointerLeave={() => setAlvo(null)}
      className="relative aspect-[4/5] cursor-zoom-in overflow-hidden border-2 border-foreground bg-background"
    >
      {/* A foto em si. A ampliação (scale) cresce a partir do ponto do mouse (transform-origin), por
          isso a área sob o cursor é a que aparece maior. O transform-origin acompanha o mouse quase
          em tempo real (80 ms), e a ampliação em si é um pouco mais lenta (250 ms) para ser suave. */}
      <div
        className="h-full w-full"
        style={{
          transform: alvo ? "scale(2.6)" : "scale(1)",
          transformOrigin: alvo ? `${alvo.x}% ${alvo.y}%` : "50% 50%",
          transition: alvo ? "transform-origin 80ms linear, transform 250ms ease-out" : "transform 250ms ease-out",
        }}
      >
        {children}
      </div>
      {/* Dica no canto ("Passe o mouse para ampliar"): só em telas largas e some quando a lupa está ativa. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 left-3 hidden bg-foreground px-3 py-1 font-mono text-xs uppercase tracking-[0.15em] text-background md:block"
        style={{ visibility: alvo ? "hidden" : "visible" }}
      >
        Passe o mouse para ampliar
      </span>
    </div>
  );
}
