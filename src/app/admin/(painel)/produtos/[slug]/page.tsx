// ============================================================================
// Tela de edição de um produto: /admin/produtos/<endereço-da-peça>.
//
// O dono chega aqui clicando no nome da peça na lista. Mostra o formulário já preenchido com os dados
// atuais; ao salvar, a ação updateProductAction grava e a loja mostra a mudança na hora.
// ============================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/admin/auth";
import { getProductRow } from "@/server/admin/products";
import { updateProductAction } from "@/app/admin/actions";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { ProductForm } from "../ProductForm";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Editar produto · Painel DarkWear" } };

// params: o trecho variável do endereço. Em /admin/produtos/camisa-preta, slug = "camisa-preta".
export default async function EditarProdutoPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const product = await getProductRow(slug);
  // Endereço que não corresponde a nenhum produto: mostra a página 404.
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina sobretitulo="Editar produto" titulo={product.name} descricao="Mude preço, foto, tamanhos e cores. O estoque se ajusta na lista de produtos." />
      {/* Com "product" = formulário de edição (campos preenchidos, endereço travado). */}
      <ProductForm action={updateProductAction} product={product} />
    </div>
  );
}
