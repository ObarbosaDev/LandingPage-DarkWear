// ============================================================================
// Página CONTATO: /contato. Toda a comunicação com a loja é pelo WhatsApp.
//
// Em vez de um botão simples, a página é uma "folha para escrever": o cliente escolhe o assunto
// (dúvida, orçamento, meu pedido, minha arte), a mensagem já vem preenchida e ele pode editá-la em
// letras gigantes; o botão abre o WhatsApp com o texto pronto (Compositor).
// Abaixo, três avisos curtos: atendimento, pagamento e envio.
// ============================================================================

import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { Compositor } from "@/components/Compositor";

export const metadata: Metadata = { title: "Contato" };

// Cada assunto vira um botão e traz uma mensagem inicial. "id" identifica o botão ativo; "rotulo" é
// o texto do botão; "texto" é o que aparece escrito na folha ao escolher aquele assunto.
// (No assunto "Meu pedido" o texto termina com ": " para o cliente completar com o número do pedido.)
const ASSUNTOS = [
  { id: "duvida", rotulo: "Dúvida", texto: `Olá! Tenho uma dúvida sobre a ${SITE.name}.` },
  { id: "orcamento", rotulo: "Orçamento", texto: `Olá! Quero um orçamento de camisetas estampadas na ${SITE.name}.` },
  { id: "pedido", rotulo: "Meu pedido", texto: `Olá! Quero falar sobre o meu pedido na ${SITE.name}. O número dele é: ` },
  { id: "arte", rotulo: "Minha arte", texto: `Olá! Tenho uma arte e quero estampar na ${SITE.name}.` },
];

// Os três avisos do rodapé da página.
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

      {/* A folha para escrever a mensagem e o botão de enviar pelo WhatsApp. */}
      <Compositor assuntos={ASSUNTOS} numero={SITE.whatsappNumber} />

      {/* Avisos curtos, em três colunas (uma embaixo da outra no celular). */}
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
