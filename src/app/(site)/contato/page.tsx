import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Contato" };

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
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(4rem,14vw,13rem)] uppercase leading-[0.86]">
            Fala com
            <br />a gente
          </h1>
        </div>
      </section>

      {/* O botão é o bloco inteiro: branco, de ponta a ponta, inverte ao passar o mouse. */}
      <a
        href={whatsappLink(`Olá! Vim pelo site da ${SITE.name}.`)}
        target="_blank"
        rel="noopener noreferrer"
        className="group block bg-foreground text-background transition-colors hover:bg-background hover:text-foreground"
      >
        <span className="mx-auto flex max-w-7xl items-center justify-between gap-6 border-y-2 border-foreground px-6 py-14 font-[family-name:var(--font-display)] text-[clamp(2.5rem,8vw,7rem)] uppercase leading-none md:py-20">
          Chamar no WhatsApp
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-3">→</span>
        </span>
      </a>

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
