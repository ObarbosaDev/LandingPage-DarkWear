import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProduct, getProducts } from "@/server/catalog";
import { formatBRL } from "@/lib/site";
import { ProductBuy } from "./ProductBuy";
import { ProductImage } from "@/components/ProductImage";
import { ProductZoom } from "@/components/ProductZoom";

export async function generateStaticParams() {
  return (await getProducts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  return { title: product?.name ?? "Produto" };
}

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const esgotado = product.stock === 0;
  const poucas = !esgotado && product.stock <= 3;

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pb-20 pt-10 md:pt-14">
        <Link href="/loja" className="w-fit text-lg font-medium underline-offset-4 hover:underline">
          ← Voltar para a loja
        </Link>

        {/* O nome ocupa a largura toda: a peça é a manchete. */}
        <h1 className="mt-6 font-display text-[clamp(3.5rem,11vw,10.5rem)] uppercase leading-[1.14]">
          {product.name}
        </h1>

        <div className="mt-10 grid gap-12 md:grid-cols-[1.1fr_1fr]">
          <ProductZoom>
            <ProductImage product={product} sizes="(min-width: 768px) 55vw, 100vw" priority />
          </ProductZoom>

          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-foreground pb-6">
              <p className="font-display text-7xl leading-none">{formatBRL(product.price)}</p>
              <div className="text-right">
                <p className="font-mono text-sm uppercase tracking-[0.15em]">{product.category}</p>
                {esgotado ? (
                  <p className="font-display text-3xl uppercase leading-none">Esgotado</p>
                ) : (
                  <p className="font-display text-3xl uppercase leading-none">
                    {poucas ? `Só restam ${product.stock}` : "Pronta entrega"}
                  </p>
                )}
              </div>
            </div>
            <p className="max-w-lg text-xl font-medium">{product.description}</p>
            <ProductBuy product={product} />
          </div>
        </div>
      </div>
    </section>
  );
}
