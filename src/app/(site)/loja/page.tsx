// ============================================================================
// Página da LOJA: /loja (e /loja?q=termo, quando o cliente usa a busca do cabeçalho).
//
// Estrutura: uma abertura com o título "Loja" e o total de peças em numeral gigante, seguida da vitrine
// (Vitrine): as peças em quadrados, com a foto inteira à vista, o nome e o preço embaixo.
//
// Por que há <Suspense> aqui: a busca (?q=) só é conhecida na hora do pedido, então a lista de
// resultados é "dinâmica". Envolvê-la em Suspense deixa o resto da página (título, abertura)
// ser pré-gerado e entregue na hora, enquanto a lista chega logo depois.
// ============================================================================

import type { Metadata } from "next";
import { Suspense } from "react";
import { getProducts } from "@/server/catalog";
import { Vitrine } from "@/components/Vitrine";

export const metadata: Metadata = { title: "Loja" };

// Numeral gigante com o total de peças: a abertura da loja é um número, não um título repetido.
async function Contagem() {
  const all = await getProducts();
  return (
    <div className="flex items-end gap-4 md:flex-col md:items-end md:gap-0 md:text-right">
      {/* padStart(2, "0"): mostra "03" em vez de "3". */}
      <span className="font-display text-[clamp(6rem,16vw,15rem)] leading-[0.8]">
        {String(all.length).padStart(2, "0")}
      </span>
      <span className="pb-2 font-mono text-sm uppercase tracking-[0.15em] md:pb-0 md:pt-4">peças no estoque</span>
    </div>
  );
}

/**
 * A lista de peças, já filtrada pela busca. Lê o parâmetro ?q= do endereço, procura no NOME das peças
 * (sem diferenciar maiúsculas de minúsculas) e entrega o resultado à vitrine.
 */
async function Resultados({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const all = await getProducts();
  const term = (q ?? "").trim();
  // Sem termo: todas as peças. Com termo: só as que contêm o texto no nome.
  const list = term
    ? all.filter((p) => p.name.toLowerCase().includes(term.toLowerCase()))
    : all;

  return (
    <>
      {/* Resumo da busca ("2 resultado(s) para "camisa""), só quando há termo. */}
      {term ? (
        <p className="mx-auto max-w-7xl px-6 pb-6 text-lg font-medium text-foreground">
          {list.length} resultado(s) para &quot;{term}&quot;
        </p>
      ) : null}
      {list.length === 0 ? (
        <p className="mx-auto max-w-7xl px-6 pb-24 text-xl font-medium text-foreground">
          Nenhuma peça com esse nome. Tente outro termo.
        </p>
      ) : (
        <Vitrine products={list} />
      )}
    </>
  );
}

export default function LojaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <>
      {/* Abertura: título, frase curta e a contagem de peças à direita. */}
      <section className="bg-background text-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-8 border-b-2 border-foreground px-6 pb-10 pt-16 md:pt-24">
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-[clamp(4.5rem,13vw,12rem)] uppercase leading-[0.88]">Loja</h1>
            <p className="max-w-md text-xl font-medium">Peça pronta do estoque. Escolhe o tamanho e fecha no WhatsApp.</p>
          </div>
          {/* Sem texto reserva (fallback): enquanto o número carrega, o espaço fica vazio. */}
          <Suspense fallback={null}>
            <Contagem />
          </Suspense>
        </div>
      </section>
      {/* Espaçador entre a abertura e o índice. */}
      <div className="h-10 bg-background" />
      <Suspense fallback={<p className="mx-auto max-w-7xl px-6 pb-24 text-lg font-medium text-foreground">Carregando peças…</p>}>
        <Resultados searchParams={searchParams} />
      </Suspense>
    </>
  );
}
