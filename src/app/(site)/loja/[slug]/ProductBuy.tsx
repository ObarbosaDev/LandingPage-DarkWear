// ============================================================================
// Bloco de COMPRA da página de uma peça: escolher cor e tamanho e adicionar à sacola.
//
// Quem usa: src/app/(site)/loja/[slug]/page.tsx. É componente de navegador ("use client") porque
// guarda as escolhas do cliente (cor, tamanho) e conversa com o carrinho (useCart).
//
// Regras: o botão fica desabilitado até escolher um tamanho; o estoque é POR TAMANHO E COR: um tamanho sem
// unidades na cor escolhida aparece riscado e não pode ser escolhido, e uma cor sem nenhuma unidade também;
// peça esgotada não oferece compra e sugere a encomenda personalizada; depois de adicionar, aparece o atalho
// "Ir para a sacola".
// ============================================================================

"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/product";
import { estoqueDaVariacao } from "@/lib/variants";

export function ProductBuy({ product }: { product: Product }) {
  const { add } = useCart();
  // Tamanho começa SEM escolha (obriga o cliente a escolher). A cor já começa na primeira disponível.
  const [size, setSize] = useState<string | null>(null);
  // A cor começa na primeira que ainda tem alguma unidade (se todas esgotaram, na primeira).
  const temEstoqueNaCor = (c: string) => product.sizes.some((s) => estoqueDaVariacao(product.variants, s, c) > 0);
  const [color, setColor] = useState(() => product.colors.find(temEstoqueNaCor) ?? product.colors[0]);
  // true depois de adicionar: faz o atalho "Ir para a sacola" aparecer.
  const [added, setAdded] = useState(false);
  const soldOut = product.stock === 0;
  // Quantas unidades há do tamanho escolhido NA cor escolhida (0 enquanto não escolheu tamanho).
  const naVariacao = size ? estoqueDaVariacao(product.variants, size, color) : 0;

  /** Troca a cor. Se o tamanho já escolhido não existe nessa cor, o tamanho é desmarcado (o cliente escolhe outro). */
  function escolherCor(c: string) {
    setColor(c);
    if (size && estoqueDaVariacao(product.variants, size, c) === 0) setSize(null);
    setAdded(false);
  }

  /** Coloca a peça (com o tamanho e a cor escolhidos) na sacola. */
  function handleAdd() {
    if (!size || soldOut || naVariacao === 0) return;
    add({
      // O id junta peça, tamanho e cor: a mesma combinação cai na MESMA linha da sacola
      // (e aumenta a quantidade), em vez de criar uma linha repetida.
      id: `${product.slug}|${size}|${color}`,
      slug: product.slug,
      name: product.name,
      priceCents: product.priceCents,
      size,
      color,
      // O estoque DAQUELE tamanho e cor limita a quantidade que o cliente consegue pôr na sacola.
      max: naVariacao,
    });
    setAdded(true);
  }

  // Estilo dos botões de escolha (cor/tamanho): o escolhido fica preenchido; os outros invertem ao passar o mouse.
  const chip = (on: boolean) =>
    `min-h-11 border-2 px-4 py-2 text-base font-medium transition-colors ${
      on ? "border-foreground bg-foreground text-background" : "border-foreground text-foreground hover:bg-foreground hover:text-background"
    }`;
  // Opção sem estoque: borda tracejada e texto riscado (continua legível, nunca apagado).
  const esgotadoChip = "min-h-11 cursor-not-allowed border-2 border-dashed border-foreground px-4 py-2 text-base font-medium text-foreground line-through";

  return (
    <div className="flex flex-col gap-8">
      {/* Escolha da cor. aria-pressed avisa leitores de tela qual botão está selecionado. */}
      <fieldset>
        <legend className="mb-3 font-mono text-sm uppercase tracking-[0.15em] text-foreground">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => escolherCor(c)}
              aria-pressed={color === c}
              disabled={!temEstoqueNaCor(c)}
              className={temEstoqueNaCor(c) ? chip(color === c) : esgotadoChip}
            >
              {c}
              {!temEstoqueNaCor(c) && <span className="sr-only"> (esgotada)</span>}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Escolha do tamanho. */}
      <fieldset>
        <legend className="mb-3 font-mono text-sm uppercase tracking-[0.15em] text-foreground">Tamanho</legend>
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((s) => {
            const tem = estoqueDaVariacao(product.variants, s, color) > 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                aria-pressed={size === s}
                disabled={!tem}
                className={`${tem ? chip(size === s) : esgotadoChip} min-w-14`}
              >
                {s}
                {!tem && <span className="sr-only"> (esgotado nesta cor)</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {soldOut ? (
        // Peça esgotada: em vez do botão de compra, oferece a alternativa da encomenda personalizada.
        <p className="border-2 border-foreground p-5 text-lg font-medium text-foreground">
          Esgotado no momento. Quer uma parecida?{" "}
          <Link href="/personalizar" className="underline underline-offset-4">
            Encomende a sua
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* O texto do botão guia o cliente: "Escolha um tamanho" até ele escolher; depois vira
              "Adicionar à sacola". Fica desabilitado enquanto não há tamanho. */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!size}
            className="border-2 border-foreground bg-foreground px-8 py-5 font-display text-2xl uppercase tracking-wide text-background transition-colors enabled:hover:bg-transparent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:bg-transparent disabled:text-foreground"
          >
            {size ? "Adicionar à sacola" : "Escolha um tamanho"}
          </button>
          {/* Aviso de poucas unidades daquele tamanho e cor. */}
          {size && naVariacao > 0 && naVariacao <= 3 && (
            <p role="status" className="font-mono text-sm font-bold uppercase tracking-[0.12em]">
              Só {naVariacao === 1 ? "resta 1 unidade" : `restam ${naVariacao} unidades`} do {size} {color}.
            </p>
          )}
          {/* Confirmação + atalho para a sacola, só depois de adicionar. */}
          {added && (
            <Link href="/carrinho" className="text-lg font-medium text-foreground underline underline-offset-4">
              Ir para a sacola →
            </Link>
          )}
        </div>
      )}

      <p className="text-base font-medium text-foreground">Pix ou cartão, combinado no WhatsApp. Estoque limitado.</p>
    </div>
  );
}
