import type { Metadata } from "next";

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
    <section className="mx-auto max-w-3xl px-4 py-12">
      <p className="eyebrow">Dúvidas</p>
      <h1 className="title-street mb-10">FAQ</h1>
      <div className="divide-y divide-border border-y border-border">
        {PERGUNTAS.map((p) => (
          <details key={p.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold uppercase tracking-tight">
              {p.q}
              <span className="text-muted ">+</span>
            </summary>
            <p className="mt-3 text-muted">{p.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
