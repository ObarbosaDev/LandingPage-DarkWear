import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";
import { ConversaFaq } from "@/components/ConversaFaq";

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
      <section className="bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 pb-4 pt-16 md:pt-24">
          <h1 className="font-display text-[clamp(4rem,14vw,13rem)] uppercase leading-[1.14]">
            Pergunta
            <br />aí
          </h1>
        </div>
      </section>
      <section className="bg-background text-foreground">
        <ConversaFaq perguntas={PERGUNTAS} whatsappHref={whatsappLink(`Olá! Tenho uma dúvida sobre a ${SITE.name}.`)} />
      </section>
    </>
  );
}
