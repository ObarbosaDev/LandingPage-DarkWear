"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const FOTO = "/products/porsche-gt3.webp";

const ETAPAS = [
  {
    titulo: "Arte",
    texto: "O arquivo chega e é conferido: resolução, tamanho e posição na peça. Só depois disso a gente imprime.",
  },
  {
    titulo: "Impressão",
    texto: "A arte é impressa em um filme, com uma camada de tinta branca por baixo das cores para elas não perderem força.",
  },
  {
    titulo: "Pó e cura",
    texto: "Um pó adesivo cobre a tinta ainda úmida, e o filme passa pelo forno para fixar tudo.",
  },
  {
    titulo: "Prensa",
    texto: "O filme vai sobre a peça e a prensa quente transfere a arte. O filme sai, e a estampa fica na camiseta.",
  },
];

// Foto real da peça fixa na tela: a cada etapa que entra na vista, a estampa avança.
export function ProcessoDTF() {
  const [ativa, setAtiva] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setAtiva(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const camada = (on: boolean) => ({ opacity: on ? 1 : 0, transition: "opacity 500ms ease" });

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-[1fr_1.1fr] md:gap-16">
      <div className="sticky top-16 z-10 self-start bg-background py-4 md:top-24 md:order-2 md:py-0">
        <div className="border-2 border-foreground bg-foreground p-4 text-background md:p-8">
          {/* A peça real: em cinza na arte, "impressa" de cima para baixo, com pó, e por fim pronta. */}
          <div
            className="relative mx-auto aspect-square h-[34vh] md:h-auto md:w-full"
            role="img"
            aria-label={`Etapa ${ativa + 1}: ${ETAPAS[ativa].titulo}`}
          >
            <div className="absolute inset-[6%]" style={{ filter: "grayscale(1) contrast(1.15)" }}>
              <Image src={FOTO} alt="" fill sizes="(min-width: 768px) 40vw, 60vw" className="object-contain" />
            </div>
            <div
              className="absolute inset-[6%]"
              style={{
                clipPath: ativa >= 1 ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
                transition: "clip-path 1600ms cubic-bezier(0.6, 0, 0.2, 1)",
              }}
            >
              <Image src={FOTO} alt="" fill sizes="(min-width: 768px) 40vw, 60vw" className="object-contain" />
            </div>
            {/* Pó adesivo: pontos só sobre o formato da peça */}
            <div
              className="absolute inset-[6%]"
              style={{
                ...camada(ativa === 2),
                backgroundImage: "radial-gradient(currentColor 1.4px, transparent 1.6px)",
                backgroundSize: "9px 9px",
                WebkitMask: `url(${FOTO}) center / contain no-repeat`,
                mask: `url(${FOTO}) center / contain no-repeat`,
              }}
            />
            {/* Etapa 1: marcas de conferência do arquivo */}
            <div className="absolute inset-[3%] border-2 border-dashed border-background" style={camada(ativa === 0)} />
          </div>
          <p className="mt-4 flex items-center justify-between font-mono text-sm uppercase tracking-[0.15em]">
            <span>
              Etapa {String(ativa + 1).padStart(2, "0")} de {String(ETAPAS.length).padStart(2, "0")}
            </span>
            <span>{ETAPAS[ativa].titulo}</span>
          </p>
        </div>
      </div>

      <ol className="md:order-1">
        {ETAPAS.map((e, i) => (
          <li
            key={e.titulo}
            data-i={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="flex min-h-[55vh] flex-col justify-center gap-4 border-t-2 border-foreground py-10 md:min-h-[75vh]"
          >
            <span className="font-display text-[clamp(6rem,14vw,12rem)] leading-[0.8]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-display text-5xl uppercase leading-none md:text-7xl">{e.titulo}</h3>
            <p className="max-w-md text-xl font-medium">{e.texto}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
