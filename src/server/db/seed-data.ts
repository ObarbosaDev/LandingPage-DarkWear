// ============================================================================
// Catálogo de exemplo (dados iniciais).
//
// Quem usa: src/server/db/index.ts (seedIfEmpty) e os testes.
// Para que serve: o site nunca abre vazio num banco novo. Estes produtos só são gravados quando a
// tabela de produtos está VAZIA. Depois disso, o catálogo real é editado no painel (/admin/produtos)
// e alterar este arquivo NÃO muda mais a loja.
//
// Substitua pelos produtos reais (nomes, preços, fotos e estoque) quando o dono tiver os dados.
// ============================================================================

import type { Product } from "@/lib/product";
import { dividirEstoque } from "@/lib/variants";

export const PRODUCTS: Product[] = [
  {
    // Endereço da peça: vira /loja/oversized-gt3-rs.
    slug: "oversized-gt3-rs",
    name: "Oversized GT3 RS",
    // Preço em centavos: 8990 = R$ 89,90.
    priceCents: 8990,
    description:
      "Camiseta preta oversized com estampa grande nas costas, em DTF.",
    category: "Pronta entrega",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preta"],
    stock: 12,
    // O estoque de exemplo é dividido por igual entre os tamanhos e cores; o dono ajusta no painel.
    variants: dividirEstoque(12, ["P", "M", "G", "GG"], ["Preta"]),
    // Foto em /public/products. "light" = peça escura em foto sem fundo (ganha um contorno de luz).
    image: "/products/porsche-gt3.webp",
    photoBg: "light",
  },
  {
    slug: "camisa-mumia",
    name: "Camisa Múmia",
    priceCents: 9990,
    description:
      "Camisa branca com a ilustração da múmia nas costas, com campo de nome e número.",
    category: "Coleção",
    sizes: ["P", "M", "G", "GG", "XG"],
    colors: ["Branca"],
    stock: 5,
    // O estoque de exemplo é dividido por igual entre os tamanhos e cores; o dono ajusta no painel.
    variants: dividirEstoque(5, ["P", "M", "G", "GG", "XG"], ["Branca"]),
    image: "/products/blusa-2.webp",
    // "dark" = peça clara: aparece bem sobre o fundo escuro sem contorno extra.
    photoBg: "dark",
  },
  {
    slug: "eu-faco-programa",
    name: "Eu Faço Programa",
    priceCents: 7990,
    description: "Camiseta preta com estampa grande na frente, em DTF.",
    category: "Pronta entrega",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preta"],
    stock: 8,
    // O estoque de exemplo é dividido por igual entre os tamanhos e cores; o dono ajusta no painel.
    variants: dividirEstoque(8, ["P", "M", "G", "GG"], ["Preta"]),
    image: "/products/eu-faco-programa.webp",
    photoBg: "light",
  },
];

// Busca um produto de exemplo pelo endereço. Auxiliar para testes e para conferir o catálogo inicial;
// a loja de verdade lê do banco (src/server/catalog.ts), não daqui.
export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}
