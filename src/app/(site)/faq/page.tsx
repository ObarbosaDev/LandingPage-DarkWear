import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";

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
    <section className="grid md:grid-cols-[5fr_7fr]">
      {/* Coluna preta fixa com o título; as perguntas rolam ao lado, na coluna branca. */}
      <div className="bg-background text-foreground">
        <div className="flex flex-col gap-8 px-6 pb-12 pt-16 md:sticky md:top-20 md:min-h-[calc(100vh-5rem)] md:justify-between md:pb-16 md:pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] md:pt-24">
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(6rem,17vw,16rem)] uppercase leading-[0.85]">FAQ</h1>
          <div className="flex flex-col items-start gap-5">
            <p className="max-w-sm text-xl font-medium">
              As dúvidas mais comuns sobre pedido, pagamento e produção. Não achou a sua?
            </p>
            <a
              href={whatsappLink(`Olá! Tenho uma dúvida sobre a ${SITE.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-foreground px-6 py-3 font-[family-name:var(--font-display)] text-xl uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
            >
              Chamar no WhatsApp
            </a>
          </div>
        </div>
      </div>

      <div className="bg-foreground text-background">
        <div className="px-6 py-12 md:py-24 md:pl-14 md:pr-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
          {PERGUNTAS.map((p, i) => (
            <details key={p.q} className="group border-t-2 border-background py-6 last:border-b-2">
              <summary className="grid cursor-pointer list-none grid-cols-[3rem_1fr_auto] items-baseline gap-4 font-[family-name:var(--font-display)] text-2xl uppercase leading-tight md:text-3xl">
                <span className="text-xl">{String(i + 1).padStart(2, "0")}</span>
                <span>{p.q}</span>
                <span aria-hidden="true" className="text-4xl leading-none group-open:hidden">+</span>
                <span aria-hidden="true" className="hidden text-4xl leading-none group-open:inline">−</span>
              </summary>
              <p className="mt-4 max-w-xl pl-0 text-xl font-medium md:pl-16">{p.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
