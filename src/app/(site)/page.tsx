// ============================================================================
// HOME do site: a página "/" (primeira tela que o cliente vê).
//
// Estrutura, de cima para baixo:
//   1. Abertura: título, texto curto, dois botões (ver peças / mandar a arte) e o ARCO 3D com as
//      três primeiras peças do catálogo.
//   2. Catálogo: grade com todas as peças e filtro por categoria.
//   3. Como funciona: os três passos da compra (bloco branco).
//   4. Manda a arte: convite para a encomenda personalizada, com a "área de soltar a arte".
//
// Os blocos alternam preto e branco de ponta a ponta, e o texto grande ao fundo (TypeBackdrop)
// deriva devagar, como parte do visual da marca. Os produtos vêm do banco, com cache
// (src/server/catalog.ts).
// ============================================================================

import Link from "next/link";
import { getProducts } from "@/server/catalog";
import { ProductArc } from "@/components/ProductArc";
import { CatalogGrid } from "@/components/CatalogGrid";
import { HeroType } from "@/components/HeroType";
import { TypeBackdrop } from "@/components/TypeBackdrop";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";

export default async function HomePage() {
  const products = await getProducts();
  // As três primeiras peças (na ordem definida no painel) viram os cards do arco da abertura.
  const destaques = products.slice(0, 3);

  return (
    <>
      {/* ===== 1. ABERTURA ===== */}
      <section className="relative isolate overflow-hidden bg-background">
        {/* Fundo tipográfico animado do topo da home. */}
        <HeroType />
        <div className="mx-auto max-w-7xl px-6 pt-10">
          <div className="grid items-start gap-8 md:grid-cols-[1fr_19rem]">
            <h1 className="font-display text-[clamp(3rem,7vw,6.5rem)] uppercase leading-[0.92] text-foreground">
              Escolhe uma peça.
              <br />
              Ou manda a sua arte.
            </h1>

            {/* Coluna da direita: explicação curta e os dois caminhos de compra. */}
            <div className="flex flex-col gap-6 md:pt-4">
              <p className="text-xl font-medium leading-relaxed text-foreground">
                Camisetas estampadas em DTF. Você combina preço e prazo no WhatsApp antes de a gente produzir.
              </p>
              <div className="flex flex-wrap gap-3">
                {/* Botão cheio = ação principal (comprar peça pronta). */}
                <Link
                  href="/loja"
                  className="border-2 border-foreground bg-foreground px-7 py-3 font-display text-lg uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground"
                >
                  Ver peças
                </Link>
                {/* Botão vazado = ação secundária (encomendar com a própria arte). */}
                <Link
                  href="/personalizar"
                  className="border-2 border-foreground px-7 py-3 font-display text-lg uppercase tracking-wide text-foreground transition-colors hover:bg-foreground hover:text-background"
                >
                  Mandar minha arte
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Arco de peças logo abaixo do título, sem sobreposição */}
        <div className="relative mt-8 pb-10">
          <ProductArc products={destaques} />
        </div>
      </section>

      {/* ===== 2. CATÁLOGO ===== (o id="catalogo" permite um link direto para esta seção) */}
      <section id="catalogo" className="relative isolate overflow-hidden">
        <TypeBackdrop text="Catálogo" rows={2} tone="dark" fade="bottom" />
        <div className="mx-auto max-w-7xl px-6 py-24">
        <h2 className="mb-10 font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">
          Catálogo
        </h2>
        {/* Grade com todas as peças e o filtro (Todos / Pronta entrega / Coleção). */}
        <CatalogGrid products={products} />
      </div>
      </section>

      {/* ===== 3. COMO FUNCIONA ===== (bloco branco: inverte as cores do site) */}
      <section className="relative isolate overflow-hidden bg-foreground text-background">
        <TypeBackdrop text="Como funciona" rows={3} tone="light" fade="none" />
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-12">
          <h2 className="font-display text-[clamp(3.5rem,9vw,8rem)] uppercase leading-[0.85]">
            Como funciona
          </h2>
          <div className="relative mt-16">
            {/* Linha que se desenha ligando os três passos (só em telas largas). */}
            <span aria-hidden="true" className="steps-line absolute left-0 right-0 top-0 hidden h-px bg-background md:block" />
            <div className="grid gap-12 md:grid-cols-3">
              {/* Cada passo: [número, título, texto, etiqueta, ícone]. O ícone é o desenho (SVG)
                  mostrado no canto do passo. */}
              {[
                ["01", "Escolha", "Peça pronta do estoque, ou a sua arte no modelo e tamanho que você quiser.", "Estoque",
                  <path key="a" d="M5 8h14l-1 12H6z M9 10V6a3 3 0 0 1 6 0v4" />],
                ["02", "Combine", "Fala com a gente no WhatsApp. Preço e prazo fechados antes de imprimir.", "WhatsApp",
                  <path key="b" d="M4 5h16v11H9l-5 4z" />],
                ["03", "Receba", "A gente imprime em DTF e envia pro seu endereço.", "DTF",
                  <path key="c" d="M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8" />],
              ].map(([n, t, d, tag, icon], i) => (
                // Reveal faz o passo aparecer subindo quando entra na tela; o atraso cresce de
                // um passo para o outro (efeito em sequência).
                <Reveal key={n as string} delay={i * 150}>
                  <div className="group flex flex-col gap-4 pt-10 transition-transform duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between">
                      <svg viewBox="0 0 24 24" className="h-7 w-7 text-background" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        {icon}
                      </svg>
                      <span className="border border-background px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-background">
                        {tag as string}
                      </span>
                    </div>
                    {/* O número "conta" de 0 até 1, 2 ou 3 quando aparece na tela. */}
                    <p className="font-display text-7xl leading-none text-background">
                      <CountUp to={Number(n)} />
                    </p>
                    <h3 className="font-display text-5xl uppercase leading-none">{t as string}</h3>
                    <p className="max-w-xs text-lg font-medium text-background">{d as string}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== 4. MANDA A ARTE ===== */}
      <section className="relative isolate overflow-hidden">
        <TypeBackdrop text="Manda a arte" rows={3} tone="dark" fade="top" />
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-28 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="font-display text-[clamp(3.5rem,9vw,8.5rem)] uppercase leading-[0.95]">
            Manda a arte.
          </h2>
          <p className="mt-8 max-w-lg text-xl font-medium text-foreground">
            PNG, JPG, SVG ou PDF. Você escolhe modelo, cor, tamanho e onde a arte vai: frente, costas, peito ou manga.
          </p>
          <Link
            href="/personalizar"
            className="mt-10 inline-block border-2 border-foreground bg-foreground px-10 py-5 font-display text-xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground"
          >
            Mandar minha arte
          </Link>
        </div>

        {/* Área de envio da arte: leva direto para a personalização */}
        <Link
          href="/personalizar"
          className="group flex aspect-square flex-col items-center justify-center gap-4 border-2 border-dashed border-foreground p-8 text-center transition-colors hover:bg-foreground hover:text-background"
        >
          {/* O "+" gira um quarto de volta ao passar o mouse, sugerindo "adicionar arquivo". */}
          <span className="font-display text-8xl leading-none transition-transform duration-300 group-hover:rotate-90" aria-hidden="true">
            +
          </span>
          <span className="font-display text-3xl uppercase">Solte a sua arte aqui</span>
          <span className="font-mono text-xs uppercase tracking-[0.15em]">PNG, JPG, SVG ou PDF · até 25 MB</span>
        </Link>
      </div>
      </section>
    </>
  );
}
