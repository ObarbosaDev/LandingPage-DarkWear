"use client";

import Link from "next/link";
import { useRef } from "react";
import { formatBRL } from "@/lib/site";
import type { Product } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";

export function ProductCard({ product }: { product: Product; index?: number }) {
  const soldOut = product.stock === 0;
  const ref = useRef<HTMLAnchorElement>(null);

  // Inclinação 3D leve seguindo o mouse, só em CSS.
  function onMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 9}deg) translateY(-4px)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }

  return (
    <Link
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      href={`/loja/${product.slug}`}
      className="group relative flex flex-col border-4 border-foreground bg-black transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden border-b-4 border-foreground">

        <div className="flex h-full w-full items-center justify-center transition-transform duration-500 group-hover:scale-105">
          <ProductImage product={product} sizes="(min-width: 1024px) 30vw, 90vw" />
        </div>

        {/* Categoria em texto simples, sem bloco colorido */}
        <span className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          {product.category}
        </span>

        {soldOut && (
          <span className="absolute right-3 top-3  border border-border bg-background px-3 py-1 text-sm text-muted">
            Esgotado
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="display text-3xl leading-none">{product.name}</h3>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-lg font-medium text-foreground">
            {formatBRL(product.price)}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            Ver peça →
          </span>
        </div>
      </div>
    </Link>
  );
}
