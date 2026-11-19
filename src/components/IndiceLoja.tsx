"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Product } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";
import { formatBRL } from "@/lib/site";

const FILTROS = ["Todas", "Pronta entrega", "Coleção"] as const;

// Catálogo como índice: o nome da peça é o item. No computador, a foto da peça segue o mouse.
export function IndiceLoja({ products }: { products: Product[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todas");
  const [sobre, setSobre] = useState<Product | null>(null);
  const foto = useRef<HTMLDivElement>(null);

  const lista = filtro === "Todas" ? products : products.filter((p) => p.category === filtro);

  function mover(e: React.MouseEvent) {
    const el = foto.current;
    if (!el) return;
    const w = 256;
    const x = Math.min(e.clientX + 28, window.innerWidth - w - 16);
    const y = Math.max(e.clientY - 150, 72);
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24">
      <div className="mb-8 flex flex-wrap gap-3" role="group" aria-label="Filtrar por categoria">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className={`border-2 border-foreground px-5 py-2 font-[family-name:var(--font-display)] text-xl uppercase leading-none transition-colors ${
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
        <ul onMouseMove={mover} onMouseLeave={() => setSobre(null)} className="border-b-2 border-foreground">
          {lista.map((p, i) => {
            const esgotado = p.stock === 0;
            return (
              <li key={p.slug} className="border-t-2 border-foreground">
                <Link
                  href={`/loja/${p.slug}`}
                  onMouseEnter={() => setSobre(p)}
                  onFocus={() => setSobre(p)}
                  onBlur={() => setSobre(null)}
                  className="group grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-1 px-2 py-5 transition-colors hover:bg-foreground hover:text-background focus-visible:bg-foreground focus-visible:text-background md:grid-cols-[4rem_1fr_11rem_8rem] md:py-7"
                >
                  <span className="relative row-span-3 h-24 w-20 shrink-0 md:hidden">
                    <ProductImage product={p} sizes="80px" />
                  </span>
                  <span className="hidden font-mono text-sm uppercase tracking-[0.15em] md:block">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,7.5vw,6.5rem)] uppercase leading-[0.95]">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm uppercase tracking-[0.15em] md:text-right">
                    {esgotado ? "Esgotado" : p.category}
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-3xl leading-none md:text-right">
                    {formatBRL(p.price)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Foto que acompanha o mouse (só em telas com mouse) */}
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
