import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Contato" };

export default function ContatoPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p className="eyebrow">Fale com a gente</p>
      <h1 className="title-street mt-3">Contato</h1>
      <p className="mx-auto mt-6 max-w-md text-muted">
        Dúvidas, orçamentos e pedidos são atendidos pelo WhatsApp.
      </p>
      <a
        href={whatsappLink(`Olá! Vim pelo site da ${SITE.name}.`)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 inline-block bg-foreground px-10 py-4 text-sm font-bold uppercase tracking-widest text-background hover:opacity-85"
      >
        Chamar no WhatsApp
      </a>
    </section>
  );
}
