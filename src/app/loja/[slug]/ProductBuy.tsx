"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import type { Product } from "@/data/products";

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

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="eyebrow mb-3">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`border px-4 py-2 text-sm uppercase tracking-widest ${
                color === c ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Tamanho</legend>
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`h-11 min-w-11 border px-3 text-sm font-bold ${
                size === s ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      {soldOut ? (
        <p className="border border-border p-4 text-sm text-muted">
          Esgotado no momento. Quer uma parecida?{" "}
          <Link href="/personalizar" className="underline hover:text-foreground">
            Encomende a sua
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!size}
            className="bg-foreground py-4 text-sm font-bold uppercase tracking-widest text-background enabled:hover:opacity-85 disabled:opacity-30"
          >
            {size ? "Adicionar ao carrinho" : "Escolha um tamanho"}
          </button>
          {added && (
            <Link href="/carrinho" className="text-center text-sm uppercase tracking-widest text-muted hover:text-foreground">
              Ir para o carrinho →
            </Link>
          )}
        </div>
      )}

      <p className="text-xs text-muted">Pix ou cartão, combinado no WhatsApp. Estoque limitado.</p>
    </div>
  );
}
