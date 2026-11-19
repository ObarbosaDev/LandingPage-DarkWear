// ============================================================================
// REVELAR AO ROLAR: envolve qualquer bloco e faz ele subir e aparecer suavemente quando entra na tela.
// Usado, por exemplo, nos três passos de "Como funciona" na home (cada um com um atraso diferente,
// para entrarem em sequência). O visual da animação está em motion.css (classes .reveal e .is-visible).
// ============================================================================

"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Envolve qualquer bloco: ele sobe e aparece quando entra na tela.
export function Reveal({
  children,
  className = "",
  // Atraso, em milissegundos, antes de a animação começar (usado para escalonar vários blocos).
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // O IntersectionObserver avisa quando o bloco entra na área visível da tela, sem precisar
    // vigiar a rolagem a todo instante (é mais leve que um ouvinte de scroll).
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // Adiciona a classe que dispara a animação (sobe e aparece)...
            el.classList.add("is-visible");
            // ...e para de observar: a revelação acontece uma vez só, ao primeiro aparecimento.
            io.disconnect();
          }
        }
      },
      // threshold 0.15: considera "entrou" quando 15% do bloco já está visível.
      { threshold: 0.15 },
    );
    io.observe(el);
    // Ao sair, desliga o observador (limpeza).
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
