// ============================================================================
// Ações do painel do dono (Server Actions): tudo que o dono FAZ em /admin.
//
// O que é uma Server Action: uma função que roda no servidor mas é disparada por um botão ou
// formulário da tela. É assim que "Marcar como pago", "Salvar produto" etc. funcionam sem
// precisarmos criar uma rota de API para cada um.
//
// Quem usa: as telas de /admin (login, pedidos, encomendas, produtos).
//
// SEGURANÇA: toda ação, exceto o login, começa com requireAdmin(). Uma ação pode ser chamada
// diretamente (sem passar pela tela), então não basta esconder a página: cada ação confere a sessão.
// ============================================================================

"use server";

// Ações do painel. Toda ação, exceto o login, começa com requireAdmin(): a verificação não pode
// depender só de a página estar escondida, porque uma ação pode ser chamada direto.

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import {
  adminConfigured,
  checkPassword,
  clearFailures,
  endSession,
  isLockedOut,
  registerFailure,
  requireAdmin,
  startSession,
} from "@/server/admin/auth";
import { setCustomStatus } from "@/server/admin/custom-orders";
import { checkImageFile, deleteImageByUrl, saveImage } from "@/server/admin/images";
import { updateOrderStatus } from "@/server/admin/orders";
import {
  createProduct,
  getProductRow,
  parseProductForm,
  setProductActive,
  setProductStock,
  updateProduct,
} from "@/server/admin/products";
import { clientKey } from "@/server/rate-limit";
import { ORDER_STATUS, type OrderStatus } from "@/server/db/schema";

// Em erro de validação, devolvemos também o que foi digitado: o React limpa o formulário depois de
// cada envio, e o dono não pode perder o que escreveu por causa de um campo errado.
// "error" é a mensagem a mostrar; "values" são os campos digitados, para repovoar o formulário.
export type FormState = { error?: string; values?: Record<string, string> };

// Transforma os campos do formulário num objeto simples (só os de texto; arquivos não se aplicam aqui).
const typed = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

// O catálogo da loja fica em cache: qualquer mudança de produto ou estoque precisa invalidá-lo.
// updateTag (próprio de Server Actions) expira na hora, então a loja já mostra o valor novo.
const refreshCatalog = () => updateTag("products");

// ---------- Sessão ----------

/**
 * Login do dono (formulário de /admin/login).
 * Passos: confere se o painel está configurado → barra quem errou demais → confere a senha →
 * abre a sessão e leva ao painel. Devolve uma mensagem de erro, ou redireciona em caso de sucesso.
 */
export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!adminConfigured()) {
    return { error: "Painel não configurado. Defina ADMIN_PASSWORD e ADMIN_SESSION_SECRET." };
  }

  // Bloqueio por excesso de tentativas, por origem (5 erros em 15 minutos).
  const key = await clientKey();
  if (await isLockedOut(key)) return { error: "Muitas tentativas. Tente de novo em alguns minutos." };

  if (!checkPassword(String(form.get("senha") ?? ""))) {
    await registerFailure(key);
    await new Promise((r) => setTimeout(r, 600)); // atrasa a resposta para desencorajar força bruta
    return { error: "Senha incorreta." };
  }

  // Senha certa: zera as falhas desta origem e abre a sessão.
  await clearFailures(key);
  await startSession();
  redirect("/admin");
}

/** Botão "Sair": encerra a sessão e volta à tela de login. */
export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

// ---------- Pedidos ----------

/**
 * Botões de pedido em /admin/pedidos ("Marcar como pago", "Cancelar pedido"...).
 * O formulário envia o número do pedido ("id") e o status desejado ("next").
 */
export async function changeOrderStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const next = String(form.get("next") ?? "") as OrderStatus;
  // Dados fora do esperado: ignora sem fazer nada (formulário adulterado).
  if (!Number.isInteger(id) || !ORDER_STATUS.includes(next)) return;

  const result = await updateOrderStatus(id, next);
  if (result !== "ok") {
    // Outra pessoa já mudou o pedido (ou a mudança não é permitida): avisa em vez de falhar calado.
    revalidatePath("/admin", "layout");
    redirect("/admin/pedidos?aviso=mudou");
  }
  if (next === "cancelado") refreshCatalog(); // cancelar devolve peças ao estoque
  // Atualiza todas as telas do painel (a lista, o resumo e os contadores).
  revalidatePath("/admin", "layout");
}

// ---------- Encomendas personalizadas ----------

/** Seletor de andamento em /admin/encomendas (botão "Salvar" de cada encomenda). */
export async function changeCustomStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await setCustomStatus(id, String(form.get("status") ?? ""));
  revalidatePath("/admin/encomendas");
}

// ---------- Produtos ----------

/**
 * Trata a foto do formulário de produto ANTES de conferir os outros campos.
 *   - arquivo escolhido: confere (tipo pelo conteúdo, até 2 MB), guarda no banco e põe o endereço novo
 *     no campo "image" do formulário;
 *   - caixa "Remover foto" marcada: esvazia o campo "image";
 *   - nada disso: mantém a foto atual (campo escondido).
 * Devolve o erro (ou null) e o endereço da foto NOVA, para o chamador poder apagá-la se algo falhar.
 */
async function processPhoto(form: FormData): Promise<{ error: string | null; created: string | null }> {
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    const checked = await checkImageFile(file);
    if (!checked.ok) return { error: checked.error, created: null };
    const url = await saveImage(checked.bytes, checked.type);
    form.set("image", url);
    return { error: null, created: url };
  }
  if (form.get("removeImage") === "on") form.set("image", "");
  return { error: null, created: null };
}

/**
 * Formulário "Novo produto" (/admin/produtos/novo).
 * Em caso de erro, devolve a mensagem + o que foi digitado; em caso de sucesso, volta à lista.
 */
export async function createProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const photo = await processPhoto(form);
  if (photo.error) return { error: photo.error, values: typed(form) };
  const parsed = parseProductForm(form, "novo");
  if (!parsed.ok) {
    await deleteImageByUrl(photo.created); // não deixa foto órfã no banco
    return { error: parsed.error, values: typed(form) };
  }

  if ((await createProduct(parsed.data)) === "existe") {
    await deleteImageByUrl(photo.created);
    return { error: "Já existe um produto com esse endereço.", values: typed(form) };
  }
  // A loja precisa mostrar o produto novo na hora, e a lista do painel também.
  refreshCatalog();
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos?salvo=1");
}

/** Formulário de edição (/admin/produtos/[slug]). Mesma lógica do cadastro, mas altera um existente. */
export async function updateProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  // A foto atual, para apagar do banco se for trocada ou removida (sem acumular fotos soltas).
  const before = await getProductRow(String(form.get("slug") ?? ""));
  const photo = await processPhoto(form);
  if (photo.error) return { error: photo.error, values: typed(form) };
  const parsed = parseProductForm(form, "editar");
  if (!parsed.ok) {
    await deleteImageByUrl(photo.created);
    return { error: parsed.error, values: typed(form) };
  }

  if (!(await updateProduct(parsed.data))) {
    await deleteImageByUrl(photo.created);
    return { error: "Produto não encontrado.", values: typed(form) };
  }
  // Só depois de salvar é seguro apagar a foto antiga (se a atual é outra).
  if (before?.image && before.image !== parsed.data.image) await deleteImageByUrl(before.image);
  refreshCatalog();
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos?salvo=1");
}

/** Campo "Estoque" + botão "Salvar" de cada linha da lista /admin/produtos. */
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

/** Botão "Ocultar da loja" / "Mostrar na loja" de cada linha da lista /admin/produtos. */
export async function setActiveAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  // O botão envia "true" (mostrar) ou "false" (ocultar) num campo escondido.
  await setProductActive(slug, form.get("active") === "true");
  refreshCatalog();
  revalidatePath("/admin/produtos");
}
