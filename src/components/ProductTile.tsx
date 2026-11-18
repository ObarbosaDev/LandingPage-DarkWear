import Link from "next/link";
import type { Product } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";
import { formatBRL } from "@/lib/site";

// Bloco do catálogo: alterna branco e preto, bordas coladas e inversão no hover.
export function ProductTile({ product, index }: { product: Product; index: number }) {
  const light = index % 2 === 0;
  const soldOut = product.stock === 0;

  return (
    <Link
      href={`/loja/${product.slug}`}
      className={`group flex min-h-[26rem] flex-col justify-between border-b border-r border-foreground p-6 transition-colors duration-200 ${
        light
          ? "bg-foreground text-background hover:bg-background hover:text-foreground"
          : "bg-background text-foreground hover:bg-foreground hover:text-background"
      }`}
    >
      <div className="flex items-start justify-between font-mono text-xs uppercase tracking-[0.15em]">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span>{soldOut ? "Esgotado" : product.category}</span>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <div className="relative h-64 w-56 transition-transform duration-300 group-hover:scale-105">
          <ProductImage product={product} sizes="(min-width: 1024px) 22vw, 60vw" />
        </div>
      </div>

      <div>
        <h3 className="font-[family-name:var(--font-display)] text-4xl uppercase leading-[0.9]">{product.name}</h3>
        <div className="mt-4 flex items-end justify-between">
          <span className="text-2xl font-semibold">{formatBRL(product.price)}</span>
          <span className="text-sm transition-transform duration-200 group-hover:translate-x-1">Ver peça →</span>
        </div>
      </div>
    </Link>
  );
}
