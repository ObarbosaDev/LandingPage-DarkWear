import Image from "next/image";
import type { Product } from "@/lib/product";
import { ShirtArt } from "@/components/ShirtArt";

// Foto real do produto quando existe; senão, a camiseta desenhada.
// Fotos com fundo transparente: a peça escura (photoBg: "light") ganha um contorno de luz fino, sem fundo.
export function ProductImage({
  product,
  sizes = "(min-width: 1024px) 30vw, 90vw",
  priority = false,
}: {
  product: Product;
  sizes?: string;
  priority?: boolean;
}) {
  if (!product.image) return <ShirtArt name={product.name} />;

  const rim =
    product.photoBg === "light"
      ? "[filter:drop-shadow(0_0_1.5px_rgba(255,255,255,0.95))_drop-shadow(0_0_22px_rgba(255,255,255,0.16))]"
      : "";

  return (
    <div className="relative h-full w-full">
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
