import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS, getProduct } from "@/data/products";
import { formatBRL } from "@/lib/site";
import { ProductBuy } from "./ProductBuy";
import { ProductImage } from "@/components/ProductImage";
import { TypeBackdrop } from "@/components/TypeBackdrop";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  return { title: product?.name ?? "Produto" };
}

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  return (
    <section className="relative isolate overflow-hidden bg-background">
      <TypeBackdrop text={product.category} rows={3} tone="dark" fade="bottom" size="clamp(6rem, 14vw, 14rem)" />
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-12 md:grid-cols-2 md:py-20">
        <div className="relative aspect-[4/5] border-2 border-foreground bg-background/80">
          <ProductImage product={product} sizes="(min-width: 768px) 50vw, 100vw" priority />
        </div>

        <div className="flex flex-col gap-6">
          <Link href="/loja" className="w-fit text-lg font-medium text-foreground underline-offset-4 hover:underline">
            ← Voltar para a loja
          </Link>
          <p className="font-mono text-sm uppercase tracking-[0.15em] text-foreground">{product.category}</p>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(3rem,6vw,5.5rem)] uppercase leading-[0.92] text-foreground">
            {product.name}
          </h1>
          <p className="font-[family-name:var(--font-display)] text-5xl leading-none text-foreground">{formatBRL(product.price)}</p>
          <p className="max-w-lg text-xl font-medium text-foreground">{product.description}</p>
          <ProductBuy product={product} />
        </div>
      </div>
    </section>
  );
}
