import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { PageHero } from "@/components/PageHero";

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
      <PageHero
        word="DarkWear"
        title="Sobre"
        lead="Camisetas estampadas em DTF. Peça pronta do estoque ou a sua arte, sob encomenda."
      />

      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-3">
          {PONTOS.map((p) => (
            <div key={p.titulo} className="border-t-2 border-background pt-6">
              <h2 className="font-[family-name:var(--font-display)] text-5xl uppercase leading-none">{p.titulo}</h2>
              <p className="mt-5 max-w-xs text-lg font-medium">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
