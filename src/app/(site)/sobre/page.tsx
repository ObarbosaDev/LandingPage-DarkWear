import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Sobre" };

const PONTOS = [
  {
    titulo: "Peça pronta",
    texto: `A ${SITE.name} faz camisetas com estampa DTF. Tem peça pronta no estoque, é só escolher tamanho e cor.`,
  },
  {
    titulo: "Sob encomenda",
    texto: "Se você já tem a arte, manda o arquivo, escolhe o modelo e o tamanho e confirma pelo WhatsApp. A gente imprime como você mandou.",
  },
  {
    titulo: "Combinado antes",
    texto: "O preço e o prazo são combinados no WhatsApp antes de qualquer pagamento.",
  },
];

export default function SobrePage() {
  return (
    <>
      {/* Duas metades: título à esquerda, a técnica à direita. */}
      <section className="grid md:grid-cols-2">
        <div className="flex flex-col justify-end gap-6 bg-background px-6 pb-14 pt-20 text-foreground md:min-h-[34rem] md:pb-20 md:pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] md:pt-28">
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(4.5rem,13vw,12rem)] uppercase leading-[0.88]">Sobre</h1>
          <p className="max-w-md text-xl font-medium">
            Camisetas estampadas em DTF. Peça pronta do estoque ou a sua arte, sob encomenda.
          </p>
        </div>
        <div className="flex flex-col justify-between gap-8 bg-foreground px-6 py-14 text-background md:min-h-[34rem] md:pr-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
          <p className="font-mono text-sm uppercase tracking-[0.15em]">A técnica</p>
          <p aria-hidden="true" className="font-[family-name:var(--font-display)] text-[clamp(9rem,24vw,22rem)] leading-[0.8]">DTF</p>
          <p className="max-w-sm text-lg font-medium">
            Direct to Film: a arte é impressa em um filme e transferida para a peça, com cores firmes e sem limite de detalhe.
          </p>
        </div>
      </section>

      {/* Três pontos em linhas numeradas, de ponta a ponta. */}
      <section className="bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          {PONTOS.map((p, i) => (
            <div key={p.titulo} className="grid gap-4 border-t-2 border-foreground py-8 md:grid-cols-[10rem_1fr_1fr] md:items-baseline md:gap-10 md:py-10">
              <span className="font-[family-name:var(--font-display)] text-7xl leading-none md:text-8xl">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-[family-name:var(--font-display)] text-5xl uppercase leading-none md:text-6xl">{p.titulo}</h2>
              <p className="max-w-md text-xl font-medium">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-foreground text-background">
        <Link
          href="/personalizar"
          className="group mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-14 font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,6rem)] uppercase leading-none"
        >
          Manda a sua arte
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-3">→</span>
        </Link>
      </section>
    </>
  );
}
