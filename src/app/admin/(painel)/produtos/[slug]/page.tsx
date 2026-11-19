import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getProductRow } from "@/lib/admin-data";
import { updateProductAction } from "@/app/admin/actions";
import { ProductForm } from "../ProductForm";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditarProdutoPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const product = await getProductRow(slug);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">{product.name}</h1>
      <ProductForm action={updateProductAction} product={product} />
    </div>
  );
}
