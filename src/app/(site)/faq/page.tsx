import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "FAQ" };

const PERGUNTAS = [
  {
    q: "Quais formas de pagamento vocês aceitam?",
    a: "Pix e cartão. A forma é combinada no WhatsApp antes de fechar o pedido.",
  },
  {
    q: "Quanto tempo leva a produção?",
    a: "Peças prontas saem do estoque. Encomendas personalizadas são produzidas sob demanda, e o prazo é informado no WhatsApp.",
  },
  {
    q: "Qual arquivo devo enviar para a estampa?",
    a: "PNG com fundo transparente é o ideal. Também aceitamos JPG, SVG e PDF, desde que a arte tenha boa resolução.",
  },
  {
    q: "Posso encomendar uma arte que já existe em outro lugar?",
    a: "Só com direito de uso sobre a arte. Ao personalizar, você declara que tem esse direito.",
  },
  {
    q: "Vocês enviam para todo o Brasil?",
    a: "Sim. O frete é calculado no fechamento do pedido pelo WhatsApp.",
  },
  {
    q: "Posso trocar uma peça?",
    a: "Peças prontas podem ser trocadas por outro tamanho enquanto houver estoque. Encomendas personalizadas não são trocadas, exceto por defeito de impressão.",
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero
        word="Dúvidas"
        title="FAQ"
        lead="As dúvidas mais comuns sobre pedido, pagamento e produção. Não achou a sua? Chama no WhatsApp."
      />

      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-4xl px-6 py-20">
          {PERGUNTAS.map((p) => (
            <details key={p.q} className="group border-t-2 border-background py-6 last:border-b-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-[family-name:var(--font-display)] text-3xl uppercase leading-tight md:text-4xl">
                {p.q}
                <span aria-hidden="true" className="shrink-0 text-5xl leading-none group-open:hidden">+</span>
                <span aria-hidden="true" className="hidden shrink-0 text-5xl leading-none group-open:inline">−</span>
              </summary>
              <p className="mt-4 max-w-2xl text-xl font-medium">{p.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
