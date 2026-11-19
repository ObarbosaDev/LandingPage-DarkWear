import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { Compositor } from "@/components/Compositor";

export const metadata: Metadata = { title: "Contato" };

const ASSUNTOS = [
  { id: "duvida", rotulo: "Dúvida", texto: `Olá! Tenho uma dúvida sobre a ${SITE.name}.` },
  { id: "orcamento", rotulo: "Orçamento", texto: `Olá! Quero um orçamento de camisetas estampadas na ${SITE.name}.` },
  { id: "pedido", rotulo: "Meu pedido", texto: `Olá! Quero falar sobre o meu pedido na ${SITE.name}. O número dele é: ` },
  { id: "arte", rotulo: "Minha arte", texto: `Olá! Tenho uma arte e quero estampar na ${SITE.name}.` },
];

const INFO = [
  { rotulo: "Atendimento", texto: "Tudo pelo WhatsApp: dúvidas, orçamento e fechamento do pedido." },
  { rotulo: "Pagamento", texto: "Pix ou cartão, combinado na conversa antes de qualquer cobrança." },
  { rotulo: "Envio", texto: "Para todo o Brasil. O frete é calculado no fechamento." },
];

export default function ContatoPage() {
  return (
    <>
      <section className="bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 pb-12 pt-16 md:pt-24">
          <h1 className="font-display text-[clamp(4rem,14vw,13rem)] uppercase leading-[0.86]">
            Escreve
            <br />pra gente
          </h1>
        </div>
      </section>

      <Compositor assuntos={ASSUNTOS} numero={SITE.whatsappNumber} />

      <section className="bg-background text-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-3">
          {INFO.map((i) => (
            <div key={i.rotulo} className="border-t-2 border-foreground pt-5">
              <p className="font-mono text-sm uppercase tracking-[0.15em]">{i.rotulo}</p>
              <p className="mt-4 max-w-xs text-xl font-medium">{i.texto}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
