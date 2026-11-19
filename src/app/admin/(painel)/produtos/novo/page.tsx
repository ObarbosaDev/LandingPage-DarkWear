import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { createProductAction } from "@/app/admin/actions";
import { ProductForm } from "../ProductForm";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Novo produto</h1>
      <ProductForm action={createProductAction} />
    </div>
  );
}
