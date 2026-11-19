// ============================================================================
// Página SOBRE: /sobre. Conta como a DarkWear faz as camisetas (processo DTF) e como funciona a loja.
//
// Estrutura:
//   1. Abertura com a frase "Do arquivo à camiseta".
//   2. O processo em 4 etapas (ProcessoDTF): uma foto real da peça fica fixa na tela e a estampa vai
//      sendo "feita" conforme o cliente rola a página.
//   3. Três pontos curtos (peça pronta, sob encomenda, combinado antes) e um convite para mandar a arte.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { ProcessoDTF } from "@/components/ProcessoDTF";

export const metadata: Metadata = { title: "Sobre" };

// Os três pontos do bloco branco de baixo: o que a loja oferece e a regra de ouro do atendimento.
const PONTOS = [
  {
    titulo: "Peça pronta",
    texto: `A ${SITE.name} faz camisetas com estampa DTF. Tem peça pronta no estoque, é só escolher tamanho e cor.`,
  },
  {
    titulo: "Sob encomenda",
    texto: "Se você já tem a arte, manda o arquivo, escolhe o modelo e o tamanho e confirma pelo WhatsApp.",
  },
  {
    titulo: "Combinado antes",
    texto: "O preço e o prazo são combinados no WhatsApp antes de qualquer pagamento.",
  },
];

export default function SobrePage() {
  return (
    <>
      {/* ===== 1. ABERTURA ===== */}
      <section className="bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pb-24 md:pt-24">
          <p className="font-mono text-sm uppercase tracking-[0.15em]">Sobre a {SITE.name}</p>
          {/* O espaço entre as linhas é maior que o normal para o acento de "à" não encostar na linha de cima. */}
          <h1 className="mt-6 font-display text-[clamp(3.5rem,11vw,10.5rem)] uppercase leading-[1.14]">
            Do arquivo
            <br />à camiseta
          </h1>
          <p className="mt-8 max-w-xl text-xl font-medium">
            Camisetas estampadas em DTF. É assim que cada peça é feita, em quatro etapas.
          </p>
        </div>
      </section>

      {/* ===== 2. O PROCESSO EM 4 ETAPAS (animado pela rolagem) ===== */}
      <section className="bg-background pb-10 text-foreground">
        <ProcessoDTF />
      </section>

      {/* ===== 3. OS TRÊS PONTOS + CONVITE ===== */}
      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-3">
          {PONTOS.map((p) => (
            <div key={p.titulo} className="border-t-2 border-background pt-6">
              <h2 className="font-display text-5xl uppercase leading-none">{p.titulo}</h2>
              <p className="mt-5 max-w-xs text-lg font-medium">{p.texto}</p>
            </div>
          ))}
        </div>
        {/* Faixa-link de ponta a ponta: a seta anda para a direita ao passar o mouse (group-hover). */}
        <Link
          href="/personalizar"
          className="group mx-auto flex max-w-7xl items-center justify-between gap-6 border-t-2 border-background px-6 py-12 font-display text-[clamp(2.5rem,7vw,6rem)] uppercase leading-none"
        >
          Manda a sua arte
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-3">→</span>
        </Link>
      </section>
    </>
  );
}
