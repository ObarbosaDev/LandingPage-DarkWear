// ============================================================================
// API: GET /api/products  — lista as peças ativas da loja em JSON.
//
// Quem usa: hoje, nenhuma tela chama esta rota (as páginas leem o catálogo direto no servidor).
// Existe como interface pública e para facilitar testes e integrações futuras (app, outro site).
// Os preços saem em centavos (priceCents), como em todo o projeto.
// ============================================================================

import { NextResponse } from "next/server";
import { getProducts } from "@/server/catalog";

export async function GET() {
  // Usa a mesma leitura em cache da vitrine, então é rápida e sempre coerente com o que o site mostra.
  return NextResponse.json({ products: await getProducts() });
}
