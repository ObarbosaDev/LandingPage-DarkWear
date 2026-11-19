// ============================================================================
// O tipo "Produto" como a LOJA o enxerga.
//
// Quem usa: todas as telas e componentes que mostram peças (home, loja, página de produto, arco 3D,
// índice) e src/server/catalog.ts, que converte a linha do banco neste formato.
// Fica em src/lib (e não em src/server) porque componentes de navegador também precisam dele, e
// código de servidor não pode ser importado por eles.
// ============================================================================

// Produto como a loja o enxerga (já pronto para a tela).

export type Product = {
  // Endereço da peça (/loja/<slug>); também identifica a peça em carrinhos e pedidos.
  slug: string;
  name: string;
  // Preço em centavos (8990 = R$ 89,90). Use formatCents() para mostrar.
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
