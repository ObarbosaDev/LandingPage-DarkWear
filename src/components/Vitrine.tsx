// ============================================================================
// VITRINE: as peças da loja em QUADRADOS, como numa vitrine de verdade (usada em /loja).
//
// Cada peça é um quadrado emoldurado com a foto inteira dentro e, logo abaixo, o nome e o preço. Não há
// foto escondida que aparece ao passar o mouse: tudo o que a pessoa precisa ver já está à vista. Peça
// esgotada continua na vitrine, com a etiqueta "Esgotado" no canto do quadrado.
//
// O fundo do quadrado é preto de propósito: as fotos de peça escura têm um contorno de luz feito para o
// fundo preto do site (ver ProductImage), e as claras aparecem bem sobre ele.
// A grade tem 2 colunas no celular, 3 no tablet e 4 no computador; o quadrado se mantém quadrado em todas.
// ============================================================================

import Link from "next/link";
import type { Product } from "@/lib/product";
import { ProductImage } from "@/components/ProductImage";
import { formatCents } from "@/lib/money";

export function Vitrine({ products }: { products: Product[] }) {
  return (
    <section aria-label="Peças da loja" className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-10">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
          {products.map((p) => {
            const esgotado = p.stock === 0;
            return (
              <li key={p.slug}>
                {/* Peça inteira clicável: o quadrado, o nome e o preço levam à página da peça. */}
                <Link href={`/loja/${p.slug}`} className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
                  {/* O quadrado: aspect-square mantém a proporção 1:1 em qualquer largura. */}
                  <div className="relative aspect-square w-full border-2 border-foreground bg-background p-[8%]">
                    <ProductImage product={p} sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw" />
                    {esgotado && (
                      <span className="absolute left-0 top-0 bg-foreground px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.15em] text-background">
                        Esgotado
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-2xl uppercase leading-[1] underline-offset-4 group-hover:underline md:text-3xl">{p.name}</h3>
                  <p className="mt-1 text-lg font-semibold">{formatCents(p.priceCents)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
