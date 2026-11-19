import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { ProcessoDTF } from "@/components/ProcessoDTF";

export const metadata: Metadata = { title: "Sobre" };

const PONTOS = [
  {
    titulo: "Peça pronta",
    texto: `A ${SITE.name} faz camisetas com estampa DTF. Tem peça pronta no estoque, é só escolher tamanho e cor.`,
  },
  {
    titulo: "Sob encomenda",
    texto: "Se você já tem a arte, manda o arquivo, escolhe o modelo e o tamanho e confirma pelo WhatsApp.",
  },
  {
    titulo: "Combinado antes",
    texto: "O preço e o prazo são combinados no WhatsApp antes de qualquer pagamento.",
  },
];

export default function SobrePage() {
  return (
    <>
      <section className="bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pb-24 md:pt-24">
          <p className="font-mono text-sm uppercase tracking-[0.15em]">Sobre a {SITE.name}</p>
          <h1 className="mt-6 font-display text-[clamp(3.5rem,11vw,10.5rem)] uppercase leading-[1.14]">
            Do arquivo
            <br />à camiseta
          </h1>
          <p className="mt-8 max-w-xl text-xl font-medium">
            Camisetas estampadas em DTF. É assim que cada peça é feita, em quatro etapas.
          </p>
        </div>
      </section>

      <section className="bg-background pb-10 text-foreground">
        <ProcessoDTF />
      </section>

      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-3">
          {PONTOS.map((p) => (
            <div key={p.titulo} className="border-t-2 border-background pt-6">
              <h2 className="font-display text-5xl uppercase leading-none">{p.titulo}</h2>
              <p className="mt-5 max-w-xs text-lg font-medium">{p.texto}</p>
            </div>
          ))}
        </div>
        <Link
          href="/personalizar"
          className="group mx-auto flex max-w-7xl items-center justify-between gap-6 border-t-2 border-background px-6 py-12 font-display text-[clamp(2.5rem,7vw,6rem)] uppercase leading-none"
        >
          Manda a sua arte
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-3">→</span>
        </Link>
      </section>
    </>
  );
}
