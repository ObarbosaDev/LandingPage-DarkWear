// Catálogo de exemplo. Substitua pelos produtos reais (nomes, preços, fotos e estoque).

import type { Product } from "@/lib/product";

export const PRODUCTS: Product[] = [
  {
    slug: "oversized-gt3-rs",
    name: "Oversized GT3 RS",
    price: 89.9,
    description:
      "Camiseta preta oversized com estampa grande nas costas, em DTF.",
    category: "Pronta entrega",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preta"],
    stock: 12,
    image: "/products/porsche-gt3.webp",
    photoBg: "light",
  },
  {
    slug: "camisa-mumia",
    name: "Camisa Múmia",
    price: 99.9,
    description:
      "Camisa branca com a ilustração da múmia nas costas, com campo de nome e número.",
    category: "Coleção",
    sizes: ["P", "M", "G", "GG", "XG"],
    colors: ["Branca"],
    stock: 5,
    image: "/products/blusa-2.webp",
    photoBg: "dark",
  },
  {
    slug: "eu-faco-programa",
    name: "Eu Faço Programa",
    price: 79.9,
    description: "Camiseta preta com estampa grande na frente, em DTF.",
    category: "Pronta entrega",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preta"],
    stock: 8,
    image: "/products/eu-faco-programa.webp",
    photoBg: "light",
  },
];

export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}
