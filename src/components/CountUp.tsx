// ============================================================================
// CONTADOR ANIMADO: mostra um número que "conta" de 0 até o valor final quando entra na tela.
// Usado na home, nos números 01, 02 e 03 dos passos de "Como funciona".
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";

// Conta de 0 até `to` quando o elemento entra na tela.
// to = valor final; pad = quantos dígitos mostrar (2 → "01"); duration = tempo da contagem em ms.
export function CountUp({ to, pad = 2, duration = 900 }: { to: number; pad?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "started" garante que a contagem rode uma vez só, mesmo que o elemento entre e saia da tela.
    let started = false;
    // Espera o número aparecer na tela (40% visível) para só então começar a contar.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started) return;
        started = true;
        io.disconnect();
        const t0 = performance.now();
        // A cada quadro da tela, calcula quanto da contagem já passou.
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / duration); // progresso de 0 a 1
          // "Easing" (suavização): começa rápido e desacelera no fim, em vez de contar em ritmo
          // constante. Fica mais natural aos olhos.
          const eased = 1 - Math.pow(1 - k, 3);
          setValue(Math.round(eased * to));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    // tabular-nums: todos os dígitos têm a mesma largura, então o número não "treme" enquanto conta.
    <span ref={ref} className="tabular-nums">
      {String(value).padStart(pad, "0")}
    </span>
  );
}
