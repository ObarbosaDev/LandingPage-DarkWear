// ============================================================================
// Lista de produtos do painel: /admin/produtos.
//
// O que o dono faz aqui, sem sair da lista:
//   - ver todos os produtos (inclusive os ocultos);
//   - ajustar o ESTOQUE de uma peça (campo + "Salvar");
//   - OCULTAR ou MOSTRAR uma peça na loja;
//   - entrar na edição de uma peça (clicando no nome) ou cadastrar uma nova ("Novo produto").
// Toda mudança vale na loja na mesma hora (o cache do catálogo é descartado pelas ações).
//
// De onde vêm os dados: listAllProducts (src/server/admin/products.ts). Os botões chamam
// setStockAction e setActiveAction (src/app/admin/actions.ts).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/admin/auth";
import { listAllProducts } from "@/server/admin/products";
import { formatCents } from "@/lib/money";
import { setActiveAction, setStockAction } from "@/app/admin/actions";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Produtos · Painel DarkWear" } };

// searchParams: "salvo" aparece (?salvo=1) quando o dono acabou de salvar um produto no formulário.
export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  await requireAdmin();
  const { salvo } = await searchParams;
  const produtos = await listAllProducts();

  return (
    <div className="flex flex-col gap-10">
      {/* Título e o botão de cadastrar um produto novo. */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Produtos</h1>
        <Link
          href="/admin/produtos/novo"
          className="border-2 border-foreground bg-foreground px-6 py-3 font-display text-xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground"
        >
          Novo produto
        </Link>
      </div>

      {/* Confirmação depois de salvar o formulário (o formulário redireciona para cá com ?salvo=1). */}
      {salvo ? (
        <p role="status" className="border-2 border-foreground p-4 text-lg font-bold">
          Produto salvo. A loja já mostra a mudança.
        </p>
      ) : null}

      {produtos.length === 0 ? (
        <p className="text-xl font-medium">Nenhum produto cadastrado.</p>
      ) : (
        <ul className="border-b-2 border-foreground">
          {produtos.map((p) => (
            // Cada linha tem 3 áreas: nome/preço/situação, ajuste de estoque e mostrar/ocultar.
            <li key={p.slug} className="grid gap-4 border-t-2 border-foreground py-5 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <Link
                  href={`/admin/produtos/${p.slug}`}
                  className="font-display text-3xl uppercase leading-none underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>
                <p className="mt-2 text-lg font-medium">
                  {formatCents(p.priceCents)} · {p.category} · {p.active ? "Ativo" : "Oculto na loja"}
                </p>
              </div>

              {/* Ajuste rápido de estoque: o campo já vem com o valor atual; o "slug" escondido diz de qual peça é. */}
              <form action={setStockAction} className="flex items-center gap-2">
                <input type="hidden" name="slug" value={p.slug} />
                <label htmlFor={`estoque-${p.slug}`} className="font-mono text-sm uppercase tracking-[0.15em]">
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
                <button
                  type="submit"
                  className="border-2 border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-foreground hover:text-background"
                >
                  Salvar
                </button>
              </form>

              {/* Mostrar/ocultar: o campo escondido "active" já leva o valor OPOSTO ao atual, então um
                  clique sempre inverte a situação da peça. */}
              <form action={setActiveAction}>
                <input type="hidden" name="slug" value={p.slug} />
                <input type="hidden" name="active" value={String(!p.active)} />
                <button
                  type="submit"
                  className="border-2 border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-foreground hover:text-background"
                >
                  {p.active ? "Ocultar da loja" : "Mostrar na loja"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
