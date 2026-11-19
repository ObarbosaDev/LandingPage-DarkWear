import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Contato" };

export default function ContatoPage() {
  return (
    <>
      <PageHero
        word="WhatsApp"
        title="Contato"
        lead="Dúvidas, orçamentos e pedidos são atendidos pelo WhatsApp."
      />

      <section className="bg-foreground text-background">
        <a
          href={whatsappLink(`Olá! Vim pelo site da ${SITE.name}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="group mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-16 font-[family-name:var(--font-display)] text-[clamp(3rem,9vw,8rem)] uppercase leading-none transition-colors hover:bg-background hover:text-foreground"
        >
          Chamar no WhatsApp
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-3">→</span>
        </a>
      </section>
    </>
  );
}
