// ============================================================================
// Formulário de produto do painel (cadastro e edição).
//
// Quem usa: /admin/produtos/novo (sem "product" = cadastro) e /admin/produtos/[slug] (com "product"
// = edição). É um único formulário para os dois casos, para as regras e o visual não divergirem.
//
// É componente de navegador ("use client") porque precisa mostrar "Salvando…" durante o envio,
// exibir erros do servidor e MANTER o que o dono digitou quando há um erro (o React limpa os campos
// depois de cada envio; aqui eles são repreenchidos com o que veio de volta em state.values).
// A validação de verdade acontece no servidor (parseProductForm).
// ============================================================================

"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";
import type { ProductRow } from "@/server/db/schema";

// Estilos repetidos: o rótulo pequeno em fonte mono e o campo de texto (borda grossa, inverte ao focar).
const label = "font-mono text-sm uppercase tracking-[0.15em]";
const field =
  "w-full border-2 border-foreground bg-transparent px-4 py-3 text-lg font-medium text-foreground outline-none focus:bg-foreground focus:text-background";

// A ação do servidor que o formulário chama ao enviar (criar ou atualizar, conforme a tela).
type Action = (prev: FormState, form: FormData) => Promise<FormState>;

// Mesmo formulário para criar e editar. Na edição, o endereço (slug) não muda.
export function ProductForm({ action, product }: { action: Action; product?: ProductRow }) {
  // state.error = mensagem do servidor; state.values = o que foi digitado (para repreencher);
  // pending = true enquanto o servidor responde.
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const editing = Boolean(product);
  // Valor inicial de cada campo: o que o dono digitou (se houve erro) ou o produto salvo.
  const v = (name: string, fallback: string) => state.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-8">
      {/* Endereço da peça (parte do link /loja/<endereço>). Ao cadastrar, é digitado; ao editar,
          é só exibido e enviado num campo escondido, porque mudar o endereço quebraria os links
          e os pedidos antigos. */}
      <div className="flex flex-col gap-3">
        <label htmlFor="slug" className={label}>
          Endereço (slug)
        </label>
        {editing ? (
          <>
            <input type="hidden" name="slug" value={product!.slug} />
            <p className="text-xl font-bold">{product!.slug}</p>
          </>
        ) : (
          <input id="slug" name="slug" required placeholder="camisa-preta" defaultValue={v("slug", "")} className={field} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="name" className={label}>Nome</label>
        <input id="name" name="name" required maxLength={80} defaultValue={v("name", product?.name ?? "")} className={field} />
      </div>

      {/* Linha com três campos: preço, estoque e categoria. */}
      <div className="grid gap-8 sm:grid-cols-3">
        <div className="flex flex-col gap-3">
          <label htmlFor="price" className={label}>Preço (R$)</label>
          {/* O preço é digitado em reais ("89,90"). Ao editar, os centavos guardados viram texto
              com vírgula. O servidor converte de volta para centavos (parsePriceToCents). */}
          <input
            id="price"
            name="price"
            required
            inputMode="decimal"
            placeholder="89,90"
            defaultValue={v("price", product ? (product.priceCents / 100).toFixed(2).replace(".", ",") : "")}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor="stock" className={label}>Estoque</label>
          {/* Ao editar o estoque NÃO é um campo: mexer nele aqui poderia apagar vendas feitas
              enquanto o formulário estava aberto. O ajuste fica na lista de produtos. */}
          {editing ? (
            <p className="text-lg font-medium">
              {product!.stock} peças. Ajuste na lista de produtos, para não apagar vendas recentes.
            </p>
          ) : (
            <input id="stock" name="stock" type="number" min={0} step={1} required defaultValue={v("stock", "0")} className={field} />
          )}
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor="category" className={label}>Categoria</label>
          <select id="category" name="category" defaultValue={v("category", product?.category ?? "Pronta entrega")} className={`${field} bg-background`}>
            <option value="Pronta entrega">Pronta entrega</option>
            <option value="Coleção">Coleção</option>
          </select>
        </div>
      </div>

      {/* Tamanhos e cores: o dono digita separando por vírgula; o servidor transforma em lista. */}
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label htmlFor="sizes" className={label}>Tamanhos (separados por vírgula)</label>
          <input id="sizes" name="sizes" required placeholder="P, M, G, GG" defaultValue={v("sizes", product?.sizes.join(", ") ?? "")} className={field} />
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor="colors" className={label}>Cores (separadas por vírgula)</label>
          <input id="colors" name="colors" required placeholder="Preta, Branca" defaultValue={v("colors", product?.colors.join(", ") ?? "")} className={field} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="description" className={label}>Descrição</label>
        <textarea id="description" name="description" rows={3} maxLength={600} defaultValue={v("description", product?.description ?? "")} className={field} />
      </div>

      {/* Foto: ainda não há upload pelo painel. O arquivo é colocado na pasta public/products do
          projeto e aqui se informa o caminho. O seletor ao lado diz como a foto deve ser tratada. */}
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label htmlFor="image" className={label}>Foto (caminho em /public)</label>
          <input id="image" name="image" placeholder="/products/arquivo.webp" defaultValue={v("image", product?.image ?? "")} className={field} />
          <p className="text-base font-medium">
            Coloque o arquivo na pasta <code>public/products</code> do projeto e informe o caminho aqui.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor="photoBg" className={label}>Peça da foto</label>
          {/* "Escura" faz a peça ganhar um contorno de luz para não sumir no fundo preto do site. */}
          <select id="photoBg" name="photoBg" defaultValue={v("photoBg", product?.photoBg ?? "")} className={`${field} bg-background`}>
            <option value="">Padrão</option>
            <option value="light">Escura (ganha contorno de luz)</option>
            <option value="dark">Clara</option>
          </select>
        </div>
      </div>

      {/* Mostrar ou ocultar na loja. Depois de um erro, respeita o que o dono tinha marcado
          (state.values existe só quando houve erro); sem erro, usa o valor salvo do produto. */}
      <label className="flex items-center gap-3 text-lg font-medium">
        <input type="checkbox" name="active" defaultChecked={state.values ? state.values.active === "on" : (product?.active ?? true)} className="h-5 w-5 accent-white" />
        Produto ativo (aparece na loja)
      </label>

      {/* Erro devolvido pelo servidor (preço inválido, endereço repetido...). */}
      {state.error ? (
        <p role="alert" className="border-2 border-foreground p-4 text-lg font-bold">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="border-2 border-foreground bg-foreground px-8 py-4 font-display text-2xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground disabled:cursor-wait"
        >
          {pending ? "Salvando…" : "Salvar produto"}
        </button>
        <Link href="/admin/produtos" className="text-lg font-medium underline underline-offset-4">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
