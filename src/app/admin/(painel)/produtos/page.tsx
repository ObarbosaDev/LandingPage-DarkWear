// ============================================================================
// Lista de produtos do painel: /admin/produtos. A ideia: a PRATELEIRA.
//
// Cada peça é um quadrado emoldurado com a foto inteira, como na vitrine da loja, só que do lado de dentro do
// balcão: embaixo da foto, o nome, o preço, a PILHA DE ESTOQUE (10 blocos, um por peça: dá para ler o estoque
// sem ler o número) e os controles. O dono faz tudo sem sair da prateleira:
//   - ajustar o ESTOQUE de uma peça (campo + "Salvar");
//   - OCULTAR ou MOSTRAR uma peça na loja (a peça oculta fica marcada "Oculto" e em preto e branco);
//   - entrar na edição (preço, foto, descrição) pelo nome ou por "Editar", ou cadastrar uma nova ("Novo produto").
// Toda mudança vale na loja na mesma hora (o cache do catálogo é descartado pelas ações).
//
// De onde vêm os dados: listAllProducts (src/server/admin/products.ts). Os botões chamam
// setStockAction e setActiveAction (src/app/admin/actions.ts).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { ProductImage } from "@/components/ProductImage";
import { formatCents } from "@/lib/money";
import type { Product } from "@/lib/product";
import { medidorDeEstoque } from "@/lib/stock-meter";
import { requireAdmin } from "@/server/admin/auth";
import { listAllProducts } from "@/server/admin/products";
import type { ProductRow } from "@/server/db/schema";
import { setActiveAction, setStockAction } from "@/app/admin/actions";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Prateleira · Painel DarkWear" } };

/** A linha do banco no formato que o componente da foto espera (campos vazios viram "ausentes"). */
const comoProduto = (p: ProductRow): Product => ({
  ...p,
  category: p.category as Product["category"],
  image: p.image ?? undefined,
  photoBg: (p.photoBg ?? undefined) as Product["photoBg"],
});

// searchParams: "salvo" aparece (?salvo=1) quando o dono acabou de salvar um produto no formulário.
export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  await requireAdmin();
  const { salvo } = await searchParams;
  const produtos = await listAllProducts();

  return (
    <div className="flex flex-col gap-10">
      {/* Título e o botão de cadastrar um produto novo. */}
      <CabecalhoDePagina
        sobretitulo="Catálogo"
        titulo="Prateleira"
        descricao="Preço, fotos, estoque e o que aparece na loja. Tudo se edita aqui."
        acoes={
          <Link
            href="/admin/produtos/novo"
            className="border-2 border-foreground bg-foreground px-6 py-3 font-display text-xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground"
          >
            Novo produto
          </Link>
        }
      />

      {/* Confirmação depois de salvar o formulário (o formulário redireciona para cá com ?salvo=1). */}
      {salvo ? (
        <p role="status" className="border-2 border-foreground p-4 text-lg font-bold">
          Produto salvo. A loja já mostra a mudança.
        </p>
      ) : null}

      {produtos.length === 0 ? (
        <p className="text-xl font-medium">Nenhum produto cadastrado.</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
          {produtos.map((p) => {
            const m = medidorDeEstoque(p.stock);
            return (
              <li key={p.slug} className="flex flex-col">
                {/* O quadrado da foto: igual ao da vitrine da loja. Peça oculta fica em preto e branco e marcada. */}
                <Link href={`/admin/produtos/${p.slug}`} aria-label={`Editar ${p.name}`} className="group relative block aspect-square w-full border-2 border-foreground bg-background p-[8%]">
                  <div className={`h-full w-full ${p.active ? "" : "grayscale"}`}>
                    <ProductImage product={comoProduto(p)} sizes="(min-width: 1280px) 28vw, (min-width: 640px) 45vw, 90vw" />
                  </div>
                  <span className="absolute left-0 top-0 flex gap-px font-mono text-xs font-bold uppercase tracking-[0.15em]">
                    {!p.active && <span className="bg-foreground px-3 py-1 text-background">Oculto</span>}
                    {p.stock === 0 && <span className="border-2 border-foreground bg-background px-3 py-0.5 text-foreground">Esgotado</span>}
                  </span>
                </Link>

                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <Link href={`/admin/produtos/${p.slug}`} className="font-display text-4xl uppercase leading-none underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-xl font-bold">{formatCents(p.priceCents)}</span>
                </div>
                <p className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.12em]">{p.category}</p>

                {/* A pilha de estoque: 10 blocos, um por peça. */}
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex gap-0.5" aria-hidden="true">
                    {Array.from({ length: m.total }, (_, i) => (
                      <span key={i} className={`block h-5 w-3 border-2 border-foreground ${i < m.cheios ? "bg-foreground" : ""}`} />
                    ))}
                  </span>
                  <span className="font-mono text-sm font-bold">
                    {p.stock === 0 ? "Esgotado" : `${p.stock} ${p.stock === 1 ? "peça" : "peças"}`}
                    {m.nivel === "baixo" && p.stock > 0 ? " · repor" : ""}
                  </span>
                </div>

                {/* Ajuste rápido de estoque: o campo já vem com o valor atual; o "slug" escondido diz de qual peça é. */}
                <form action={setStockAction} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="slug" value={p.slug} />
                  <label htmlFor={`estoque-${p.slug}`} className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                    Estoque
                  </label>
                  <input
                    id={`estoque-${p.slug}`}
                    name="stock"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={p.stock}
                    className="w-24 border-2 border-foreground bg-transparent px-3 py-2 text-lg font-bold"
                  />
                  <button type="submit" className="border-2 border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-foreground hover:text-background">
                    Salvar
                  </button>
                </form>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Mostrar/ocultar: o campo escondido "active" já leva o valor OPOSTO ao atual, então um
                      clique sempre inverte a situação da peça. */}
                  <form action={setActiveAction}>
                    <input type="hidden" name="slug" value={p.slug} />
                    <input type="hidden" name="active" value={String(!p.active)} />
                    <button type="submit" className="border-2 border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-foreground hover:text-background">
                      {p.active ? "Ocultar da loja" : "Mostrar na loja"}
                    </button>
                  </form>
                  <Link href={`/admin/produtos/${p.slug}`} className="border-2 border-foreground bg-foreground px-4 py-2 text-base font-bold text-background transition-colors hover:bg-transparent hover:text-foreground">
                    Editar →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
