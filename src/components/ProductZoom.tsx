"use client";

import { useState, type ReactNode } from "react";

// Lupa: com o mouse sobre a foto, ela amplia no ponto do cursor para ver o detalhe da estampa.
// Em tela de toque a foto fica inteira, sem zoom.
export function ProductZoom({ children }: { children: ReactNode }) {
  const [alvo, setAlvo] = useState<{ x: number; y: number } | null>(null);

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setAlvo({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  }

  return (
    <div
      onPointerMove={mover}
      onPointerLeave={() => setAlvo(null)}
      className="relative aspect-[4/5] cursor-zoom-in overflow-hidden border-2 border-foreground bg-background"
    >
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
