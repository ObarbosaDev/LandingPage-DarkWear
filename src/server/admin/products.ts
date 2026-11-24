// ============================================================================
// Produtos vistos pelo DONO: listar, validar formulário, criar, editar, ajustar estoque e ocultar.
//
// Quem usa: as telas /admin/produtos (lista), /admin/produtos/novo e /admin/produtos/[slug]
// (formulário) e as ações de src/app/admin/actions.ts.
// A leitura do catálogo para o CLIENTE (com cache) fica em src/server/catalog.ts.
//
// Princípio: tudo que vem do formulário é tratado como não confiável. Cada campo é conferido aqui,
// no servidor, mesmo que a tela já tenha conferido (a tela pode ser contornada).
// ============================================================================

// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import "server-only";
import { and, asc, eq, max, notInArray, or } from "drizzle-orm";
import { chaveDaVariacao, type EstoquePorVariacao } from "@/lib/variants";
import { getDb } from "@/server/db";
import { productStock, products, type ProductRow } from "@/server/db/schema";

/** Maior estoque aceito numa variação (um número absurdo é quase certamente erro de digitação). */
const ESTOQUE_MAXIMO = 100000;

/** O estoque de TODAS as peças por tamanho e cor, agrupado por peça (para a lista do painel). */
export async function listVariantStock(): Promise<Map<string, EstoquePorVariacao>> {
  const db = await getDb();
  const linhas = await db.select().from(productStock);
  const mapa = new Map<string, EstoquePorVariacao>();
  for (const v of linhas) {
    const atual = mapa.get(v.productSlug) ?? {};
    atual[chaveDaVariacao(v.size, v.color)] = v.stock;
    mapa.set(v.productSlug, atual);
  }
  return mapa;
}

/** Todos os produtos, inclusive os ocultos (o dono precisa ver tudo), na ordem da loja. */
export async function listAllProducts(): Promise<ProductRow[]> {
  const db = await getDb();
  return db.select().from(products).orderBy(asc(products.position), asc(products.createdAt));
}

/** Um produto pelo endereço, ativo ou não. Usado para preencher o formulário de edição. */
export async function getProductRow(slug: string): Promise<ProductRow | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(products).where(eq(products.slug, slug));
  return row;
}

/** Os dados de um produto já validados e limpos, prontos para gravar. */
export type ProductInput = {
  slug: string;
  name: string;
  priceCents: number;
  description: string;
  category: "Pronta entrega" | "Coleção";
  sizes: string[];
  colors: string[];
  // No cadastro: o estoque INICIAL de cada tamanho e cor (na edição não é lido, ver parseProductForm).
  stock: number;
  image: string | null;
  photoBg: "light" | "dark" | null;
  active: boolean;
};

// As duas categorias que a loja oferece como filtro.
const CATEGORIES = ["Pronta entrega", "Coleção"] as const;

/**
 * Transforma "P, M, G" em ["P","M","G"], sem repetidos e sem vazios.
 * Devolve a lista, ou um TEXTO com o motivo da recusa (quem chama distingue pelo tipo).
 * Usada nos campos Tamanhos e Cores do formulário.
 */
function parseList(raw: string, label: string): string[] | string {
  const list = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (list.length === 0) return `Informe ao menos um valor em ${label}.`;
  if (list.length > 12) return `${label}: no máximo 12 valores.`;
  if (list.some((s) => s.length > 20)) return `${label}: cada valor tem no máximo 20 caracteres.`;
  // O "|" separa tamanho e cor nas chaves de estoque ("M|Preta"): permitir nos nomes confundiria as chaves.
  if (list.some((s) => s.includes("|"))) return `${label}: não use o caractere "|".`;
  return list;
}

// "89,90", "1.299,90", "1.299" (milhar) ou "89.90" → centavos inteiros.
/**
 * Lê o preço digitado pelo dono e devolve CENTAVOS inteiros, ou null se for inválido.
 * Entende o jeito brasileiro (vírgula decimal e ponto de milhar) e também "89.90".
 * Trabalhar em centavos evita erro de arredondamento com dinheiro.
 */
export function parsePriceToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  // Sem vírgula, só pontos de milhar ("1.299", "1.299.000") são tratados como milhar; "89.90" segue decimal.
  const thousandsOnly = !s.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(s);
  // Normaliza para o formato que o JavaScript entende: sem pontos de milhar e com ponto decimal.
  const norm = s.includes(",") || thousandsOnly ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  // Recusa lixo, negativo e valores absurdos (acima de R$ 100.000, quase certamente um erro de digitação).
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.round(n * 100);
}

/**
 * Confere o formulário de produto e devolve os dados limpos, ou a mensagem do primeiro problema.
 *
 * @param form dados enviados pelo formulário (ProductForm)
 * @param mode "novo" ao cadastrar, "editar" ao alterar um existente. Muda duas regras: o endereço
 *             (slug) só é conferido ao criar, e o estoque só é lido ao criar.
 */
export function parseProductForm(
  form: FormData,
  mode: "novo" | "editar",
): { ok: true; data: ProductInput } | { ok: false; error: string } {
  // Lê um campo como texto sem espaços nas pontas (campo ausente vira "").
  const get = (k: string) => String(form.get(k) ?? "").trim();

  // Endereço da peça: vira parte do link (/loja/camisa-preta), então só letras minúsculas,
  // números e hífens, sem hífen sobrando nas pontas.
  const slug = get("slug").toLowerCase();
  if (mode === "novo" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Endereço inválido: use só letras minúsculas, números e hífen (ex.: camisa-preta)." };
  }
  if (slug.length < 2 || slug.length > 60) return { ok: false, error: "O endereço deve ter de 2 a 60 caracteres." };

  const name = get("name");
  if (!name || name.length > 80) return { ok: false, error: "Informe o nome (até 80 caracteres)." };

  const priceCents = parsePriceToCents(get("price"));
  if (priceCents === null) return { ok: false, error: "Preço inválido. Exemplo: 89,90." };

  // Na edição o estoque não é lido do formulário: ele muda com as vendas, e gravar o valor que estava
  // na tela apagaria as vendas feitas enquanto o dono editava. O ajuste fica na lista de produtos.
  // Campo vazio não vale como 0 (Number("") é 0): o dono precisa digitar a quantidade.
  const stock = mode === "novo" ? (get("stock") === "" ? NaN : Number(get("stock"))) : 0;
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return { ok: false, error: "Estoque deve ser um número inteiro, 0 ou mais." };

  const category = get("category");
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Categoria inválida." };

  // parseList devolve a lista OU um texto de erro; checar o tipo separa os dois casos.
  const sizes = parseList(get("sizes"), "Tamanhos");
  if (typeof sizes === "string") return { ok: false, error: sizes };
  const colors = parseList(get("colors"), "Cores");
  if (typeof colors === "string") return { ok: false, error: colors };

  // A foto é a atual do produto (campo escondido "image") e só pode ser de dois tipos: um arquivo de
  // /public/products ou uma foto enviada pelo painel (/api/images/<número>). A regra impede apontar
  // para outro site ou subir diretórios (ex.: /products/../segredo). A foto NOVA, se houver, é
  // tratada pela ação do formulário (src/app/admin/actions.ts) antes desta conferência.
  const image = get("image");
  if (image && !/^\/products\/[\w.-]+$/.test(image) && !/^\/api\/images\/\d{1,9}$/.test(image)) {
    return { ok: false, error: "Foto inválida. Envie um arquivo JPG, PNG ou WebP." };
  }

  const photoBg = get("photoBg");
  if (photoBg && photoBg !== "light" && photoBg !== "dark") return { ok: false, error: "Fundo da foto inválido." };

  const description = get("description");
  if (description.length > 600) return { ok: false, error: "Descrição: no máximo 600 caracteres." };

  return {
    ok: true,
    data: {
      slug,
      name,
      priceCents,
      description,
      category: category as ProductInput["category"],
      sizes,
      colors,
      stock,
      image: image || null,
      photoBg: (photoBg as ProductInput["photoBg"]) || null,
      // Uma caixa de seleção desmarcada simplesmente não é enviada: só "on" significa marcada.
      active: form.get("active") === "on",
    },
  };
}

/**
 * Cadastra um produto novo.
 * @returns "existe" se já há produto com esse endereço; "ok" se cadastrou
 */
export async function createProduct(p: ProductInput): Promise<"ok" | "existe"> {
  const db = await getDb();
  const [dup] = await db.select({ slug: products.slug }).from(products).where(eq(products.slug, p.slug));
  if (dup) return "existe";
  // O produto novo vai para o FIM da loja: posição = maior posição atual + 1.
  const [{ top }] = await db.select({ top: max(products.position) }).from(products);
  // Peça e variações juntas: ou nasce tudo ou nada. O total da peça (products.stock) vem do gatilho do banco.
  await db.transaction(async (tx) => {
    await tx.insert(products).values({
      slug: p.slug,
      name: p.name,
      priceCents: p.priceCents,
      description: p.description,
      category: p.category,
      sizes: p.sizes,
      colors: p.colors,
      image: p.image,
      photoBg: p.photoBg,
      active: p.active,
      position: (top ?? -1) + 1,
    });
    await syncVariants(tx, p.slug, p.sizes, p.colors, p.stock);
  });
  return "ok";
}

/**
 * Altera os dados de um produto existente (o endereço não muda).
 * Repare que o ESTOQUE não é alterado aqui, de propósito: ele só muda pelas vendas e pelo ajuste
 * rápido da lista (setProductStock), para a edição de um texto nunca apagar vendas recentes.
 * @returns false se o produto não existe
 */
export async function updateProduct(p: ProductInput): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
  const done = await tx
    .update(products)
    .set({
      name: p.name,
      priceCents: p.priceCents,
      description: p.description,
      category: p.category,
      sizes: p.sizes,
      colors: p.colors,
      image: p.image,
      photoBg: p.photoBg,
      active: p.active,
      updatedAt: new Date(),
    })
    .where(eq(products.slug, p.slug))
    .returning({ slug: products.slug });
  if (done.length === 0) return false;
  // Tamanhos e cores podem ter mudado: cria as variações novas (com 0) e tira as que saíram da lista.
  await syncVariants(tx, p.slug, p.sizes, p.colors, 0);
  return true;
  });
}

/** A transação aberta pelo banco (o que as funções de gravação recebem). */
type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

/**
 * Deixa as variações da peça iguais a tamanhos x cores: cria as que faltam (com `inicial` peças) e apaga as
 * que saíram da lista. As que continuam NÃO são tocadas: o estoque que já existe nunca é zerado por uma edição.
 * Atenção: tirar um tamanho ou cor apaga o estoque daquela variação (o total da peça é recalculado pelo banco).
 */
async function syncVariants(tx: Tx, slug: string, sizes: string[], colors: string[], inicial: number) {
  const quer = sizes.flatMap((s) => colors.map((c) => ({ productSlug: slug, size: s, color: c, stock: inicial })));
  if (quer.length > 0) await tx.insert(productStock).values(quer).onConflictDoNothing();
  // Apaga o que não está mais em tamanhos x cores: tamanho que saiu OU cor que saiu.
  await tx
    .delete(productStock)
    .where(
      and(
        eq(productStock.productSlug, slug),
        or(notInArray(productStock.size, sizes), notInArray(productStock.color, colors)),
      ),
    );
}

// Ajustes rápidos, direto da lista de produtos.
/**
 * Define o estoque de cada tamanho e cor de uma peça (os campos + "Salvar" da lista /admin/produtos).
 * Só aceita combinações que existem na peça e números inteiros de 0 a 100000; qualquer valor ruim recusa TUDO
 * (nada é gravado pela metade). As combinações que não vierem em `estoque` ficam como estão.
 * @returns false se algum número ou combinação é inválido, ou se a peça não existe
 */
export async function setVariantStock(slug: string, estoque: EstoquePorVariacao): Promise<boolean> {
  const entradas = Object.entries(estoque);
  if (entradas.length === 0) return false;
  if (entradas.some(([, n]) => !Number.isInteger(n) || n < 0 || n > ESTOQUE_MAXIMO)) return false;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ sizes: products.sizes, colors: products.colors }).from(products).where(eq(products.slug, slug));
    if (!p) return false;
    // Toda chave precisa ser uma combinação real desta peça.
    const validas = new Set(p.sizes.flatMap((s) => p.colors.map((c) => chaveDaVariacao(s, c))));
    if (entradas.some(([k]) => !validas.has(k))) return false;
    for (const [chave, stock] of entradas) {
      const i = chave.indexOf("|");
      await tx
        .update(productStock)
        .set({ stock })
        .where(and(eq(productStock.productSlug, slug), eq(productStock.size, chave.slice(0, i)), eq(productStock.color, chave.slice(i + 1))));
    }
    return true;
  });
}

/**
 * Mostra ou oculta um produto na loja (botão "Ocultar da loja"/"Mostrar na loja").
 * Ocultar não apaga nada: o pedido antigo continua válido e o dono pode mostrar de novo.
 * @returns false se o produto não existe
 */
export async function setProductActive(slug: string, active: boolean): Promise<boolean> {
  const db = await getDb();
  const done = await db
    .update(products)
    .set({ active, updatedAt: new Date() })
    .where(eq(products.slug, slug))
    .returning({ slug: products.slug });
  return done.length > 0;
}
