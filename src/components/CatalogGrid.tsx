// ============================================================================
// Catálogo em GRADE com filtro por categoria, usado na HOME (seção "Catálogo").
// (A página /loja usa outro formato, a vitrine de quadrados: Vitrine.)
//
// Mostra botões de filtro (Todos, e uma categoria para cada tipo de peça existente) com a contagem
// de peças, e abaixo a grade de blocos (ProductTile). É componente de navegador porque guarda
// qual filtro está escolhido.
// ============================================================================

"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/product";
import { ProductTile } from "@/components/ProductTile";

// Catálogo geral com filtro por categoria. Mostra tudo por padrão.
export function CatalogGrid({ products }: { products: Product[] }) {
  // As categorias são descobertas a partir das próprias peças (sem repetir): se o dono cadastrar
  // uma categoria nova no futuro, o botão aparece sozinho. useMemo evita refazer a conta à toa.
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const [active, setActive] = useState<string>("Todos");

  const list = active === "Todos" ? products : products.filter((p) => p.category === active);
  const chips = ["Todos", ...categories];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        {/* Botões de filtro. role="tab"/aria-selected informam a leitores de tela qual está ativo. */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por categoria">
          {chips.map((c) => {
            // Quantas peças cada botão traria (mostrado ao lado do nome).
            const count = c === "Todos" ? products.length : products.filter((p) => p.category === c).length;
            const on = c === active;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(c)}
                className={`border-2 px-4 py-2 text-sm font-medium transition-colors ${
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted hover:border-foreground hover:text-foreground"
                }`}
              >
                {c} <span className="ml-1">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted">{list.length} peças</p>
      </div>

      {/* A grade: blocos colados (só as bordas de cima/esquerda aqui; cada bloco fecha as de baixo/direita). */}
      <div className="grid border-l border-t border-foreground sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p, i) => (
          <ProductTile key={p.slug} product={p} index={i} />
        ))}
      </div>
    </div>
  );
}
