"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/product";

export function ProductBuy({ product }: { product: Product }) {
  const { add } = useCart();
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState(product.colors[0]);
  const [added, setAdded] = useState(false);
  const soldOut = product.stock === 0;

  function handleAdd() {
    if (!size || soldOut) return;
    add({
      id: `${product.slug}|${size}|${color}`,
      slug: product.slug,
      name: product.name,
      price: product.price,
      size,
      color,
      max: product.stock,
    });
    setAdded(true);
  }

  const chip = (on: boolean) =>
    `min-h-11 border-2 px-4 py-2 text-base font-medium transition-colors ${
      on ? "border-foreground bg-foreground text-background" : "border-foreground text-foreground hover:bg-foreground hover:text-background"
    }`;

  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-3 font-mono text-sm uppercase tracking-[0.15em] text-foreground">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} className={chip(color === c)}>
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-mono text-sm uppercase tracking-[0.15em] text-foreground">Tamanho</legend>
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((s) => (
            <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s} className={`${chip(size === s)} min-w-14`}>
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      {soldOut ? (
        <p className="border-2 border-foreground p-5 text-lg font-medium text-foreground">
          Esgotado no momento. Quer uma parecida?{" "}
          <Link href="/personalizar" className="underline underline-offset-4">
            Encomende a sua
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!size}
            className="border-2 border-foreground bg-foreground px-8 py-5 font-display text-2xl uppercase tracking-wide text-background transition-colors enabled:hover:bg-transparent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:bg-transparent disabled:text-foreground"
          >
            {size ? "Adicionar à sacola" : "Escolha um tamanho"}
          </button>
          {added && (
            <Link href="/carrinho" className="text-lg font-medium text-foreground underline underline-offset-4">
              Ir para a sacola →
            </Link>
          )}
        </div>
      )}

      <p className="text-base font-medium text-foreground">Pix ou cartão, combinado no WhatsApp. Estoque limitado.</p>
    </div>
  );
}
