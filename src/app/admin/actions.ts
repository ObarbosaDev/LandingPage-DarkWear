"use server";

// Ações do painel. Toda ação, exceto o login, começa com requireAdmin(): a verificação não pode
// depender só de a página estar escondida, porque uma ação pode ser chamada direto.

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import {
  adminConfigured,
  checkPassword,
  clearFailures,
  clientKey,
  endSession,
  isLockedOut,
  registerFailure,
  requireAdmin,
  startSession,
} from "@/lib/admin-auth";
import {
  createProduct,
  parseProductForm,
  setCustomStatus,
  setProductActive,
  setProductStock,
  updateOrderStatus,
  updateProduct,
} from "@/lib/admin-data";
import { ORDER_STATUS, type OrderStatus } from "@/db/schema";

// Em erro de validação, devolvemos também o que foi digitado: o React limpa o formulário depois de
// cada envio, e o dono não pode perder o que escreveu por causa de um campo errado.
export type FormState = { error?: string; values?: Record<string, string> };

const typed = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

// O catálogo da loja fica em cache: qualquer mudança de produto ou estoque precisa invalidá-lo.
// updateTag (próprio de Server Actions) expira na hora, então a loja já mostra o valor novo.
const refreshCatalog = () => updateTag("products");

// ---------- Sessão ----------

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!adminConfigured()) {
    return { error: "Painel não configurado. Defina ADMIN_PASSWORD e ADMIN_SESSION_SECRET." };
  }

  const key = await clientKey();
  if (await isLockedOut(key)) return { error: "Muitas tentativas. Tente de novo em alguns minutos." };

  if (!checkPassword(String(form.get("senha") ?? ""))) {
    await registerFailure(key);
    await new Promise((r) => setTimeout(r, 600)); // atrasa a resposta para desencorajar força bruta
    return { error: "Senha incorreta." };
  }

  await clearFailures(key);
  await startSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

// ---------- Pedidos ----------

export async function changeOrderStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const next = String(form.get("next") ?? "") as OrderStatus;
  if (!Number.isInteger(id) || !ORDER_STATUS.includes(next)) return;

  const result = await updateOrderStatus(id, next);
  if (result !== "ok") {
    // Outra pessoa já mudou o pedido (ou a mudança não é permitida): avisa em vez de falhar calado.
    revalidatePath("/admin", "layout");
    redirect("/admin/pedidos?aviso=mudou");
  }
  if (next === "cancelado") refreshCatalog(); // cancelar devolve peças ao estoque
  revalidatePath("/admin", "layout");
}

// ---------- Encomendas personalizadas ----------

export async function changeCustomStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await setCustomStatus(id, String(form.get("status") ?? ""));
  revalidatePath("/admin/encomendas");
}

// ---------- Produtos ----------

export async function createProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseProductForm(form, "novo");
  if (!parsed.ok) return { error: parsed.error, values: typed(form) };

  if ((await createProduct(parsed.data)) === "existe") {
    return { error: "Já existe um produto com esse endereço.", values: typed(form) };
  }
  refreshCatalog();
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos?salvo=1");
}

export async function updateProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseProductForm(form, "editar");
  if (!parsed.ok) return { error: parsed.error, values: typed(form) };

  if (!(await updateProduct(parsed.data))) return { error: "Produto não encontrado.", values: typed(form) };
  refreshCatalog();
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos?salvo=1");
}

export async function setStockAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  // Campo vazio não pode virar 0 (Number("") é 0): sem número digitado, não muda nada.
  const raw = String(form.get("stock") ?? "").trim();
  if (!raw) return;
  await setProductStock(slug, Number(raw));
  refreshCatalog();
  revalidatePath("/admin/produtos");
}

export async function setActiveAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  await setProductActive(slug, form.get("active") === "true");
  refreshCatalog();
  revalidatePath("/admin/produtos");
}
