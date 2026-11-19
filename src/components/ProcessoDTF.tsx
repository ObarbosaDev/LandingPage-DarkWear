// ============================================================================
// PROCESSO DTF (página /sobre): explica, em 4 etapas, como a estampa é feita, com uma FOTO REAL da
// peça que muda conforme o cliente rola a página.
//
// Layout: na coluna da esquerda, as quatro etapas em blocos altos (cada um ocupa boa parte da tela);
// na direita, a foto da peça FIXA na tela (sticky). Quando uma etapa chega ao meio da tela, a foto
// "avança" para o estado daquela etapa:
//   1. Arte       → foto em cinza, com a moldura tracejada de conferência do arquivo;
//   2. Impressão  → a COR é "impressa" sobre a foto, de cima para baixo;
//   3. Pó e cura  → aparecem pontos (o pó adesivo) só sobre o formato da peça;
//   4. Prensa     → a peça pronta, em cores, sem efeitos.
//
// É componente de navegador ("use client") porque observa a rolagem e muda de estado.
// ============================================================================

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// A foto usada na demonstração (uma peça do catálogo de exemplo).
const FOTO = "/products/porsche-gt3.webp";

// As quatro etapas: título e o texto explicativo de cada uma.
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
  // Índice da etapa ativa (0 a 3): é a que está no meio da tela agora.
  const [ativa, setAtiva] = useState(0);
  // Referências aos quatro blocos de texto, para observarmos quando cada um cruza o meio da tela.
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // O IntersectionObserver avisa quando um bloco entra numa "faixa" da tela. O rootMargin de
    // -45% em cima e embaixo reduz a área observada a uma faixa fina no MEIO da tela: um bloco só
    // conta como ativo quando está passando pelo centro, e não assim que aparece na borda.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // O número da etapa vem do atributo data-i colocado em cada bloco (veja o <li> abaixo).
          if (e.isIntersecting) setAtiva(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // Estilo de uma camada que aparece (opacidade 1) ou some (0) com uma transição suave de meio segundo.
  const camada = (on: boolean) => ({ opacity: on ? 1 : 0, transition: "opacity 500ms ease" });

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-[1fr_1.1fr] md:gap-16">
      {/* COLUNA DA FOTO: sticky = fica grudada no topo enquanto o texto rola. No celular fica em cima
          (altura menor) e em telas largas fica à direita (md:order-2). */}
      <div className="sticky top-16 z-10 self-start bg-background py-4 md:top-24 md:order-2 md:py-0">
        <div className="border-2 border-foreground bg-foreground p-4 text-background md:p-8">
          {/* A peça real: em cinza na arte, "impressa" de cima para baixo, com pó, e por fim pronta. */}
          {/* Várias camadas empilhadas (todas na mesma posição): a de baixo é a foto em cinza, depois a
              foto colorida revelada aos poucos, o pó e a moldura de conferência. */}
          <div
            className="relative mx-auto aspect-square h-[34vh] md:h-auto md:w-full"
            role="img"
            aria-label={`Etapa ${ativa + 1}: ${ETAPAS[ativa].titulo}`}
          >
            {/* Camada 1 (base): a foto em PRETO E BRANCO. É o que se vê na etapa 1 (só o "arquivo"). */}
            <div className="absolute inset-[6%]" style={{ filter: "grayscale(1) contrast(1.15)" }}>
              <Image src={FOTO} alt="" fill sizes="(min-width: 768px) 40vw, 60vw" className="object-contain" />
            </div>
            {/* Camada 2: a foto COLORIDA, escondida por um "recorte" (clip-path). Nas etapas 2 em diante o
                recorte se abre de cima para baixo em 1,6 s: parece a cor sendo impressa na peça. */}
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
            {/* Camada 3: uma trama de pontinhos, recortada no FORMATO da própria foto (a máscara usa
                a imagem como molde), então os pontos só aparecem sobre a peça. Visível só na etapa 3. */}
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
            {/* Camada 4: moldura tracejada, só na etapa 1 ("arquivo sendo conferido"). */}
            <div className="absolute inset-[3%] border-2 border-dashed border-background" style={camada(ativa === 0)} />
          </div>
          {/* Legenda sob a foto: "Etapa 02 de 04" e o nome da etapa atual. */}
          <p className="mt-4 flex items-center justify-between font-mono text-sm uppercase tracking-[0.15em]">
            <span>
              Etapa {String(ativa + 1).padStart(2, "0")} de {String(ETAPAS.length).padStart(2, "0")}
            </span>
            <span>{ETAPAS[ativa].titulo}</span>
          </p>
        </div>
      </div>

      {/* COLUNA DO TEXTO: as quatro etapas, cada uma num bloco bem alto para dar tempo de rolar e
          ver a foto mudar. */}
      <ol className="md:order-1">
        {ETAPAS.map((e, i) => (
          // data-i guarda o número da etapa para o observador (acima) saber qual bloco cruzou o meio.
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
