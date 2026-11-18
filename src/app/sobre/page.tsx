import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Sobre" };

export default function SobrePage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Sobre</p>
      <h1 className="title-street mt-3">{SITE.tagline}</h1>
      <div className="mt-10 flex flex-col gap-6 text-lg leading-relaxed text-muted">
        <p>
          A {SITE.name} faz camisetas com estampa DTF. Tem peça pronta no estoque e também
          encomenda com a arte do cliente.
        </p>
        <p>
          Se você já tem a arte, manda o arquivo, escolhe o modelo e o tamanho e confirma pelo
          WhatsApp. A gente imprime como você mandou.
        </p>
        <p>O preço e o prazo são combinados no WhatsApp antes de qualquer pagamento.</p>
      </div>
    </section>
  );
}
