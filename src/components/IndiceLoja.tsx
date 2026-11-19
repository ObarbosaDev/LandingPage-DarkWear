// ============================================================================
// ÍNDICE DA LOJA: a lista de peças da página /loja.
//
// Cada peça é uma linha com o NOME em letras enormes, a categoria e o preço. Ao passar o mouse numa
// linha, ela inverte as cores e a FOTO da peça aparece seguindo o cursor (só no computador; no
// celular cada linha mostra uma foto pequena ao lado do nome). Há botões para filtrar por categoria.
//
// É componente de navegador porque acompanha o mouse e guarda o filtro escolhido.
// ============================================================================

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Product } from "@/lib/product";
import { ProductImage } from "@/components/ProductImage";
import { formatCents } from "@/lib/money";

// Botões de filtro. "Todas" mostra tudo; os outros dois são as categorias de peça.
const FILTROS = ["Todas", "Pronta entrega", "Coleção"] as const;

// Catálogo como índice: o nome da peça é o item. No computador, a foto da peça segue o mouse.
export function IndiceLoja({ products }: { products: Product[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todas");
  // A peça sob o mouse (null = nenhuma). Define qual foto aparece na "janelinha" que segue o cursor.
  const [sobre, setSobre] = useState<Product | null>(null);
  // Referência direta à janelinha da foto: a posição é escrita no estilo sem passar pelo React
  // (mover o mouse dispara este código muitas vezes por segundo; redesenhar a cada vez seria pesado).
  const foto = useRef<HTMLDivElement>(null);

  const lista = filtro === "Todas" ? products : products.filter((p) => p.category === filtro);

  /** Move a janelinha da foto para perto do cursor, sem deixá-la sair da tela. */
  function mover(e: React.MouseEvent) {
    const el = foto.current;
    if (!el) return;
    const w = 256; // largura da janelinha (w-64 = 16rem = 256px)
    // x: um pouco à direita do cursor, mas nunca passando da borda direita da janela do navegador.
    const x = Math.min(e.clientX + 28, window.innerWidth - w - 16);
    // y: centralizada na altura do cursor, mas nunca por baixo do cabeçalho (72px do topo).
    const y = Math.max(e.clientY - 150, 72);
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24">
      {/* Filtro por categoria. aria-pressed informa a leitores de tela qual botão está ativo. */}
      <div className="mb-8 flex flex-wrap gap-3" role="group" aria-label="Filtrar por categoria">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className={`border-2 border-foreground px-5 py-2 font-display text-xl uppercase leading-none transition-colors ${
              filtro === f ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-xl font-medium">Nenhuma peça nessa categoria.</p>
      ) : (
        // O mouse sendo acompanhado na lista inteira; sair da lista esconde a foto.
        <ul onMouseMove={mover} onMouseLeave={() => setSobre(null)} className="border-b-2 border-foreground">
          {lista.map((p, i) => {
            const esgotado = p.stock === 0;
            return (
              <li key={p.slug} className="border-t-2 border-foreground">
                {/* A linha toda é um link para a página da peça. onFocus/onBlur fazem a foto também
                    aparecer para quem navega só pelo teclado (tecla Tab). */}
                <Link
                  href={`/loja/${p.slug}`}
                  onMouseEnter={() => setSobre(p)}
                  onFocus={() => setSobre(p)}
                  onBlur={() => setSobre(null)}
                  className="group grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-1 px-2 py-5 transition-colors hover:bg-foreground hover:text-background focus-visible:bg-foreground focus-visible:text-background md:grid-cols-[4rem_1fr_11rem_8rem] md:py-7"
                >
                  {/* Foto pequena ao lado do nome, SÓ no celular (md:hidden): lá não há mouse para a
                      foto seguir, então cada linha traz a sua. */}
                  <span className="relative row-span-3 h-24 w-20 shrink-0 md:hidden">
                    <ProductImage product={p} sizes="80px" />
                  </span>
                  {/* Número da linha (01, 02...), só no computador. */}
                  <span className="hidden font-mono text-sm uppercase tracking-[0.15em] md:block">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {/* O espaço entre linhas é um pouco maior que o normal para acentos (ex.: "Múmia") não encostarem. */}
                  <span className="font-display text-[clamp(2.25rem,7.5vw,6.5rem)] uppercase leading-[1.08]">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm uppercase tracking-[0.15em] md:text-right">
                    {esgotado ? "Esgotado" : p.category}
                  </span>
                  <span className="font-display text-3xl leading-none md:text-right">
                    {formatCents(p.priceCents)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Foto que acompanha o mouse (só em telas com mouse) */}
      {/* Janelinha fixa na tela (fixed), começando fora da vista (-999px). pointer-events-none deixa o
          mouse "atravessá-la" para não atrapalhar os cliques nas linhas. Fica invisível enquanto
          nenhuma peça está sob o mouse. Tem fundo preto para a peça (clara ou escura) aparecer bem. */}
      <div
        ref={foto}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-30 hidden h-72 w-64 border-2 border-foreground bg-background p-3 md:block"
        style={{ transform: "translate3d(-999px, 0, 0)", visibility: sobre ? "visible" : "hidden" }}
      >
        {sobre ? (
          <div className="relative h-full w-full">
            <ProductImage product={sobre} sizes="256px" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
