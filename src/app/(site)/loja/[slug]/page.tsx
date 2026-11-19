// ============================================================================
// Página de UMA peça: /loja/<endereço-da-peça> (ex.: /loja/oversized-gt3-rs).
//
// O cliente chega aqui clicando numa peça da loja. Mostra o nome como manchete, a foto com LUPA (zoom
// ao passar o mouse), preço, situação do estoque, descrição e o bloco de compra (escolher cor e
// tamanho e adicionar à sacola).
//
// Peça que não existe, ou que o dono ocultou, mostra a página 404.
// ============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProduct, getProducts } from "@/server/catalog";
import { formatCents } from "@/lib/money";
import { ProductBuy } from "./ProductBuy";
import { ProductImage } from "@/components/ProductImage";
import { ProductZoom } from "@/components/ProductZoom";

// Diz ao Next quais endereços existem no momento do build: uma página pronta para cada peça ativa.
// Peças criadas depois, no painel, são geradas na primeira visita.
export async function generateStaticParams() {
  return (await getProducts()).map((p) => ({ slug: p.slug }));
}

// Título da aba e do resultado de busca: o nome da peça ("Camisa Múmia · DarkWear").
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  return { title: product?.name ?? "Produto" };
}

// params: o trecho variável do endereço. Em /loja/camisa-mumia, slug = "camisa-mumia".
export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  // Não existe (ou está oculta): mostra a página "não encontrado" do site.
  if (!product) notFound();

  // Situação do estoque, para o aviso ao lado do preço.
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
          {/* Foto com lupa: ao passar o mouse, amplia no ponto do cursor para ver a estampa de perto. */}
          <ProductZoom>
            <ProductImage product={product} sizes="(min-width: 768px) 55vw, 100vw" priority />
          </ProductZoom>

          <div className="flex flex-col gap-8">
            {/* Preço à esquerda; categoria e situação do estoque à direita. */}
            <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-foreground pb-6">
              <p className="font-display text-7xl leading-none">{formatCents(product.priceCents)}</p>
              <div className="text-right">
                <p className="font-mono text-sm uppercase tracking-[0.15em]">{product.category}</p>
                {/* "Só restam N" cria urgência quando sobram 3 peças ou menos. */}
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
            {/* Escolha de cor e tamanho, e o botão "Adicionar à sacola". */}
            <ProductBuy product={product} />
          </div>
        </div>
      </div>
    </section>
  );
}
