// Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import { asc, eq, max } from "drizzle-orm";
import { getDb } from "@/server/db";
import { products, type ProductRow } from "@/server/db/schema";

export async function listAllProducts(): Promise<ProductRow[]> {
  const db = await getDb();
  return db.select().from(products).orderBy(asc(products.position), asc(products.createdAt));
}

export async function getProductRow(slug: string): Promise<ProductRow | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(products).where(eq(products.slug, slug));
  return row;
}

export type ProductInput = {
  slug: string;
  name: string;
  priceCents: number;
  description: string;
  category: "Pronta entrega" | "Coleção";
  sizes: string[];
  colors: string[];
  stock: number;
  image: string | null;
  photoBg: "light" | "dark" | null;
  active: boolean;
};

const CATEGORIES = ["Pronta entrega", "Coleção"] as const;

function parseList(raw: string, label: string): string[] | string {
  const list = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (list.length === 0) return `Informe ao menos um valor em ${label}.`;
  if (list.length > 12) return `${label}: no máximo 12 valores.`;
  if (list.some((s) => s.length > 20)) return `${label}: cada valor tem no máximo 20 caracteres.`;
  return list;
}

// "89,90", "1.299,90", "1.299" (milhar) ou "89.90" → centavos inteiros.
export function parsePriceToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  // Sem vírgula, só pontos de milhar ("1.299", "1.299.000") são tratados como milhar; "89.90" segue decimal.
  const thousandsOnly = !s.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(s);
  const norm = s.includes(",") || thousandsOnly ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.round(n * 100);
}

export function parseProductForm(
  form: FormData,
  mode: "novo" | "editar",
): { ok: true; data: ProductInput } | { ok: false; error: string } {
  const get = (k: string) => String(form.get(k) ?? "").trim();

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
  const stock = mode === "novo" ? Number(get("stock")) : 0;
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return { ok: false, error: "Estoque deve ser um número inteiro, 0 ou mais." };

  const category = get("category");
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Categoria inválida." };

  const sizes = parseList(get("sizes"), "Tamanhos");
  if (typeof sizes === "string") return { ok: false, error: sizes };
  const colors = parseList(get("colors"), "Cores");
  if (typeof colors === "string") return { ok: false, error: colors };

  const image = get("image");
  if (image && !/^\/products\/[\w.-]+$/.test(image)) {
    return { ok: false, error: "A foto deve ser um caminho como /products/arquivo.webp." };
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
      active: form.get("active") === "on",
    },
  };
}

export async function createProduct(p: ProductInput): Promise<"ok" | "existe"> {
  const db = await getDb();
  const [dup] = await db.select({ slug: products.slug }).from(products).where(eq(products.slug, p.slug));
  if (dup) return "existe";
  const [{ top }] = await db.select({ top: max(products.position) }).from(products);
  await db.insert(products).values({
    slug: p.slug,
    name: p.name,
    priceCents: p.priceCents,
    description: p.description,
    category: p.category,
    sizes: p.sizes,
    colors: p.colors,
    stock: p.stock,
    image: p.image,
    photoBg: p.photoBg,
    active: p.active,
    position: (top ?? -1) + 1,
  });
  return "ok";
}

export async function updateProduct(p: ProductInput): Promise<boolean> {
  const db = await getDb();
  const done = await db
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
  return done.length > 0;
}

// Ajustes rápidos, direto da lista de produtos.
export async function setProductStock(slug: string, stock: number): Promise<boolean> {
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return false;
  const db = await getDb();
  const done = await db
    .update(products)
    .set({ stock, updatedAt: new Date() })
    .where(eq(products.slug, slug))
    .returning({ slug: products.slug });
  return done.length > 0;
}

export async function setProductActive(slug: string, active: boolean): Promise<boolean> {
  const db = await getDb();
  const done = await db
    .update(products)
    .set({ active, updatedAt: new Date() })
    .where(eq(products.slug, slug))
    .returning({ slug: products.slug });
  return done.length > 0;
}
