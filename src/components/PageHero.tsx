import type { ReactNode } from "react";
import { TypeBackdrop } from "@/components/TypeBackdrop";

// Abertura das páginas internas: bloco preto com fundo tipográfico e título gigante.
// A palavra do fundo é diferente do título, para não duplicar a mesma frase.
export function PageHero({
  word,
  title,
  lead,
  children,
}: {
  word: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-background">
      <TypeBackdrop text={word} rows={2} tone="dark" fade="bottom" size="clamp(6rem, 15vw, 15rem)" />
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pt-24">
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(4rem,12vw,11rem)] uppercase leading-[0.9] text-foreground">
          {title}
        </h1>
        {lead ? <p className="mt-6 max-w-2xl text-xl font-medium text-foreground">{lead}</p> : null}
        {children}
      </div>
    </section>
  );
}
