// ============================================================================
// Tela "Novo produto" do painel: /admin/produtos/novo.
//
// Mostra o formulário vazio de cadastro. O mesmo formulário (ProductForm) serve para editar; aqui
// ele recebe a ação de CRIAR (createProductAction). Ao salvar, o produto aparece na loja na hora.
// ============================================================================

import type { Metadata } from "next";
import { requireAdmin } from "@/server/admin/auth";
import { createProductAction } from "@/app/admin/actions";
import { ProductForm } from "../ProductForm";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Novo produto · Painel DarkWear" } };

export default async function NovoProdutoPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Novo produto</h1>
      {/* Sem a propriedade "product" = formulário vazio (modo cadastro). */}
      <ProductForm action={createProductAction} />
    </div>
  );
}
