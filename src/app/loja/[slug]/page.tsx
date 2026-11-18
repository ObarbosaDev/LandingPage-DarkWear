import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS, getProduct } from "@/data/products";
import { formatBRL } from "@/lib/site";
import { ProductBuy } from "./ProductBuy";
import { ProductImage } from "@/components/ProductImage";

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
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2">
      <div className="flex aspect-square items-center justify-center border border-border bg-black">
        <ProductImage product={product} sizes="(min-width: 768px) 50vw, 100vw" priority />
      </div>

      <div className="flex flex-col gap-5">
        <Link href="/loja" className="eyebrow hover:text-foreground">← Loja</Link>
        <p className="eyebrow">{product.category}</p>
        <h1 className="text-4xl font-black uppercase leading-none tracking-tight">{product.name}</h1>
        <p className="text-2xl font-semibold">{formatBRL(product.price)}</p>
        <p className="text-muted">{product.description}</p>
        <ProductBuy product={product} />
      </div>
    </section>
  );
}
