import type { Metadata } from "next";
import { Suspense } from "react";
import { getProducts } from "@/lib/catalog";
import { ProductTile } from "@/components/ProductTile";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Loja" };

async function Resultados({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const all = await getProducts();
  const term = (q ?? "").trim();
  const list = term
    ? all.filter((p) => p.name.toLowerCase().includes(term.toLowerCase()))
    : all;

  return (
    <>
      <p className="mx-auto max-w-7xl px-6 pb-6 text-lg font-medium text-foreground">
        {term ? `${list.length} resultado(s) para "${term}"` : `${all.length} peças`}
      </p>
      {list.length === 0 ? (
        <p className="mx-auto max-w-7xl px-6 pb-24 text-xl font-medium text-foreground">
          Nenhuma peça com esse nome. Tente outro termo.
        </p>
      ) : (
        <div className="mx-auto max-w-7xl px-6 pb-24">
          <div className="grid border-l border-t border-foreground sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p, i) => (
              <ProductTile key={p.slug} product={p} index={i} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LojaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <>
      <PageHero word="Peças" title="Loja" lead="Peça pronta do estoque. Escolhe o tamanho e fecha no WhatsApp." />
      <Suspense fallback={<p className="mx-auto max-w-7xl px-6 pb-24 text-lg font-medium text-foreground">Carregando peças…</p>}>
        <Resultados searchParams={searchParams} />
      </Suspense>
    </>
  );
}
