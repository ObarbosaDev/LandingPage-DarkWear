// ============================================================================
// Ações do painel do dono (Server Actions): tudo que o dono FAZ em /admin.
//
// O que é uma Server Action: uma função que roda no servidor mas é disparada por um botão ou
// formulário da tela. É assim que "Marcar como pago", "Salvar produto" etc. funcionam sem
// precisarmos criar uma rota de API para cada um.
//
// Quem usa: as telas de /admin (pedidos, encomendas, produtos, clientes).
//
// SEGURANÇA: toda ação começa com requireAdmin(). Uma ação pode ser chamada diretamente (sem passar pela
// tela), então não basta esconder a página: cada ação confere que quem chama é um administrador com login
// recente (ver src/server/admin/auth.ts). Quem não é administrador recebe "não encontrado".
// ============================================================================

"use server";


import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/server/admin/auth";
import { auditar } from "@/server/admin/audit";
import { resetCustomerPassword } from "@/server/admin/customers";
import { setCustomStatus } from "@/server/admin/custom-orders";
import { checkImageFile, deleteImageByUrl, otimizarFoto, saveImage } from "@/server/admin/images";
import { setTrackingCode, updateOrderStatus } from "@/server/admin/orders";
import { createCoupon, parseCouponForm, setCouponActive } from "@/server/coupons";
import {
  createProduct,
  getProductRow,
  parseProductForm,
  setProductActive,
  setVariantStock,
  updateProduct,
} from "@/server/admin/products";
import { ORDER_STATUS, type OrderStatus } from "@/server/db/schema";
import { orderNumber } from "@/server/orders";

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

// ---------- Pedidos ----------

/**
 * Botões de pedido em /admin/pedidos ("Marcar como pago", "Cancelar pedido"...).
 * O formulário envia o número do pedido ("id") e o status desejado ("next").
 */
export async function changeOrderStatusAction(form: FormData): Promise<void> {
  const adm = await requireAdmin();
  const id = Number(form.get("id"));
  const next = String(form.get("next") ?? "") as OrderStatus;
  // Dados fora do esperado: ignora sem fazer nada (formulário adulterado).
  if (!Number.isInteger(id) || !ORDER_STATUS.includes(next)) return;

  // O código de rastreio (opcional) vem junto quando o botão é "Marcar como enviado".
  const result = await updateOrderStatus(id, next, { tracking: String(form.get("tracking") ?? ""), actor: adm.email });
  if (result === "rastreio-invalido") {
    // Nada foi mudado: o pedido continua no status de antes e o dono corrige o código.
    revalidatePath("/admin", "layout");
    redirect("/admin/pedidos?aviso=rastreio");
  }
  if (result !== "ok") {
    // Outra pessoa já mudou o pedido (ou a mudança não é permitida): avisa em vez de falhar calado.
    revalidatePath("/admin", "layout");
    redirect("/admin/pedidos?aviso=mudou");
  }
  await auditar(adm.email, "pedido.status", orderNumber(id), `→ ${next}`);
  if (next === "cancelado") refreshCatalog(); // cancelar devolve peças ao estoque
  // Atualiza todas as telas do painel (a lista, o resumo e os contadores).
  revalidatePath("/admin", "layout");
}

/** Campo "Código de rastreio" + "Salvar" de um pedido já enviado (informar ou corrigir; vazio apaga o código). */
export async function setTrackingAction(form: FormData): Promise<void> {
  const adm = await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const codigo = String(form.get("tracking") ?? "");
  const result = await setTrackingCode(id, codigo);
  if (result === "ok") await auditar(adm.email, "pedido.rastreio", orderNumber(id), codigo.trim() ? "informado" : "apagado");
  revalidatePath("/admin", "layout");
  if (result === "rastreio-invalido") redirect("/admin/pedidos?aviso=rastreio");
}

// ---------- Encomendas personalizadas ----------

/** Seletor de andamento em /admin/encomendas (botão "Salvar" de cada encomenda). */
export async function changeCustomStatusAction(form: FormData): Promise<void> {
  const adm = await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const status = String(form.get("status") ?? "");
  if (await setCustomStatus(id, status)) await auditar(adm.email, "encomenda.status", `encomenda ${id}`, `→ ${status}`);
  revalidatePath("/admin/encomendas");
}

// ---------- Produtos ----------

/**
 * Trata a foto do formulário de produto ANTES de conferir os outros campos.
 *   - arquivo escolhido: confere (tipo pelo conteúdo, até 4 MB), otimiza (reduz, WebP, sem EXIF), guarda no banco e põe o endereço novo
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
    const otimizada = await otimizarFoto(checked.bytes);
    if (!otimizada.ok) return { error: otimizada.error, created: null };
    const url = await saveImage(otimizada.bytes, otimizada.type);
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
  const adm = await requireAdmin();
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
  await auditar(adm.email, "produto.criar", parsed.data.slug, parsed.data.name);
  // A loja precisa mostrar o produto novo na hora, e a lista do painel também.
  refreshCatalog();
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos?salvo=1");
}

/** Formulário de edição (/admin/produtos/[slug]). Mesma lógica do cadastro, mas altera um existente. */
export async function updateProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  const adm = await requireAdmin();
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
  await auditar(adm.email, "produto.editar", parsed.data.slug, parsed.data.name);
  refreshCatalog();
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos?salvo=1");
}

/**
 * Os campos de estoque por tamanho e cor + botão "Salvar" de cada peça em /admin/produtos.
 * Cada campo se chama "estoque:<tamanho>|<cor>" (ex.: "estoque:M|Preta"). Campo vazio NÃO vira 0 (Number("") é 0):
 * fica como está. Qualquer valor inválido recusa o conjunto inteiro (ver setVariantStock).
 */
export async function setStockAction(form: FormData): Promise<void> {
  const adm = await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  const estoque: Record<string, number> = {};
  for (const [nome, valor] of form.entries()) {
    if (!nome.startsWith("estoque:") || typeof valor !== "string" || !valor.trim()) continue;
    estoque[nome.slice("estoque:".length)] = Number(valor);
  }
  if (Object.keys(estoque).length === 0) return;
  if (await setVariantStock(slug, estoque)) {
    await auditar(adm.email, "produto.estoque", slug, Object.entries(estoque).map(([k, n]) => `${k}=${n}`).join(", "));
  }
  refreshCatalog();
  revalidatePath("/admin/produtos");
}

/** Botão "Ocultar da loja" / "Mostrar na loja" de cada linha da lista /admin/produtos. */
export async function setActiveAction(form: FormData): Promise<void> {
  const adm = await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  // O botão envia "true" (mostrar) ou "false" (ocultar) num campo escondido.
  const mostrar = form.get("active") === "true";
  if (await setProductActive(slug, mostrar)) await auditar(adm.email, "produto.visibilidade", slug, mostrar ? "mostrado na loja" : "ocultado da loja");
  refreshCatalog();
  revalidatePath("/admin/produtos");
}

// ---------- Cupons ----------

/** Formulário "Novo cupom" (/admin/cupons). Em erro devolve a mensagem + o que foi digitado; em sucesso, volta à lista. */
export async function createCouponAction(_prev: FormState, form: FormData): Promise<FormState> {
  const adm = await requireAdmin();
  const lido = parseCouponForm(form);
  if (!lido.ok) return { error: lido.error, values: typed(form) };
  if ((await createCoupon(lido.data)) === "existe") return { error: "Já existe um cupom com este código.", values: typed(form) };
  await auditar(adm.email, "cupom.criar", lido.data.code, lido.data.kind === "percent" ? `${lido.data.value}%` : `R$ ${(lido.data.value / 100).toFixed(2).replace(".", ",")}`);
  revalidatePath("/admin/cupons");
  redirect("/admin/cupons?criado=1");
}

/** Botão "Desativar" / "Ativar" de cada cupom. O botão envia o código e o valor OPOSTO ao atual. */
export async function setCouponActiveAction(form: FormData): Promise<void> {
  const adm = await requireAdmin();
  const code = String(form.get("code") ?? "");
  const ativar = form.get("active") === "true";
  if (await setCouponActive(code, ativar)) await auditar(adm.email, "cupom.visibilidade", code.trim().toUpperCase(), ativar ? "ativado" : "desativado");
  revalidatePath("/admin/cupons");
}

// ---------- Clientes ----------

/** O que a tela recebe de volta ao gerar uma senha provisória: a senha (mostrada UMA vez) ou o erro. */
export type SenhaProvisoriaState = { error?: string; senha?: string; para?: string };

/**
 * Botão "Senha provisória" de cada cliente em /admin/clientes. Como ainda não há recuperação de senha por
 * e-mail, o dono gera uma senha provisória e a passa ao cliente (pelo WhatsApp, por exemplo); o cliente é
 * obrigado a trocá-la no próximo login. A senha aparece só na resposta desta ação e não fica guardada em claro.
 * Contas de administrador são recusadas (só se gerenciam pelo comando de terminal).
 */
export async function resetCustomerPasswordAction(_prev: SenhaProvisoriaState, form: FormData): Promise<SenhaProvisoriaState> {
  const adm = await requireAdmin();
  const id = Number(form.get("id"));
  const para = String(form.get("nome") ?? "");
  if (!Number.isSafeInteger(id) || id < 1) return { error: "Cliente inválido." };
  try {
    const senha = await resetCustomerPassword(id);
    await auditar(adm.email, "cliente.senha-provisoria", `cliente ${id}`);
    return { senha, para };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível gerar a senha." };
  }
}
