// ============================================================================
// Foto de uma peça, em qualquer lugar onde ela aparece (arco da home, grade, índice da loja, página
// da peça). Centraliza dois cuidados para eles não se repetirem:
//   - peça SEM foto mostra um bloco com as iniciais (ShirtArt);
//   - peça escura em foto sem fundo ganha um contorno de luz, para não "sumir" no fundo preto do site.
// ============================================================================

import Image from "next/image";
import type { Product } from "@/lib/product";
import { ShirtArt } from "@/components/ShirtArt";

// Foto real do produto quando existe; senão, a camiseta desenhada.
// Fotos com fundo transparente: a peça escura (photoBg: "light") ganha um contorno de luz fino, sem fundo.
export function ProductImage({
  product,
  // "sizes" diz ao Next o tamanho que a foto ocupa na tela em cada largura, para ele entregar a
  // versão do tamanho certo (arquivo menor = página mais rápida). O padrão serve para fotos grandes.
  sizes = "(min-width: 1024px) 30vw, 90vw",
  // priority = foto importante da primeira tela: carrega antes das outras.
  priority = false,
}: {
  product: Product;
  sizes?: string;
  priority?: boolean;
}) {
  // Sem foto cadastrada: mostra o bloco com as iniciais do nome.
  if (!product.image) return <ShirtArt name={product.name} />;

  // O contorno é feito com "drop-shadow" branco (um brilho fino e outro difuso) que segue o
  // formato da peça, já que a foto tem fundo transparente. Só vale para peças escuras (photoBg "light").
  const rim =
    product.photoBg === "light"
      ? "[filter:drop-shadow(0_0_1.5px_rgba(255,255,255,0.95))_drop-shadow(0_0_22px_rgba(255,255,255,0.16))]"
      : "";

  return (
    <div className="relative h-full w-full">
      {/* "fill" faz a foto preencher a caixa do pai; "object-contain" mantém a proporção, sem cortar. */}
      <Image
        src={product.image}
        alt={product.name}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-contain ${rim}`}
      />
    </div>
  );
}
