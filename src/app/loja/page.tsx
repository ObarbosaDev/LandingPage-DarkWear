import type { Metadata } from "next";
import { Suspense } from "react";
import { PRODUCTS } from "@/data/products";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = { title: "Loja" };

async function Resultados({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();
  const list = term
    ? PRODUCTS.filter((p) => p.name.toLowerCase().includes(term.toLowerCase()))
    : PRODUCTS;

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
        {term ? `${list.length} resultado(s) para "${term}"` : `${PRODUCTS.length} peças`}
      </p>
      {list.length === 0 ? (
        <p className="mt-12 text-lg text-muted">Nenhuma peça com esse nome. Tente outro termo.</p>
      ) : (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p, i) => (
            <ProductCard key={p.slug} product={p} index={i} />
          ))}
        </div>
      )}
    </>
  );
}

export default function LojaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="title-street mt-3">Loja</h1>
      <Suspense fallback={<p className="mt-12 text-muted">Carregando peças…</p>}>
        <div className="mt-3">
          <Resultados searchParams={searchParams} />
        </div>
      </Suspense>
    </section>
  );
}
