// Produto como a loja o enxerga (já pronto para a tela).

export type Product = {
  slug: string;
  name: string;
  priceCents: number;
  description: string;
  category: "Pronta entrega" | "Coleção";
  sizes: string[];
  colors: string[];
  stock: number; // unidades disponíveis; 0 = esgotado
  // Caminho da foto em /public. Enquanto estiver vazio, a página mostra um quadro de placeholder.
  image?: string;
  // "light" marca peça escura em foto com fundo transparente: ela ganha um contorno de luz para aparecer.
  photoBg?: "light" | "dark";
};
