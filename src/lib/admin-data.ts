// Acesso a dados do painel do dono. Só roda no servidor; quem chama precisa ter passado por requireAdmin().

import { and, asc, count, desc, eq, inArray, lte, max } from "drizzle-orm";
import { getDb } from "@/db";
import { customOrders, orderItems, orders, products, ORDER_STATUS, type OrderStatus, type ProductRow } from "@/db/schema";
import { cancelOrder, orderNumber } from "@/lib/orders";

// ---------- Pedidos ----------

// De cada status, para quais o dono pode mover o pedido.
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pendente: ["pago", "cancelado"],
  pago: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: [],
  cancelado: [],
};

export type AdminOrder = {
  id: number;
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  items: { name: string; size: string; color: string; qty: number; unitPriceCents: number }[];
};

export async function listOrders(status?: OrderStatus, limit = 100): Promise<AdminOrder[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));

  return rows.map((o) => ({
    id: o.id,
    number: orderNumber(o.id),
    status: o.status,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ name: i.name, size: i.size, color: i.color, qty: i.qty, unitPriceCents: i.unitPriceCents })),
  }));
}

export type StatusResult = "ok" | "invalido" | "nao-encontrado";

export async function updateOrderStatus(id: number, next: OrderStatus): Promise<StatusResult> {
  if (!ORDER_STATUS.includes(next)) return "invalido";
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) return "nao-encontrado";
  if (!NEXT_STATUS[o.status].includes(next)) return "invalido";

  // Cancelar devolve as peças ao estoque, tudo na mesma transação.
  if (next === "cancelado") return (await cancelOrder(id)) ? "ok" : "invalido";

  // Só muda se o status ainda for o que o dono viu (evita duas pessoas mudando ao mesmo tempo).
  const changed = await db
    .update(orders)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.status, o.status)))
    .returning({ id: orders.id });
  return changed.length ? "ok" : "invalido";
}

// ---------- Encomendas personalizadas ----------

export const CUSTOM_STATUS = ["novo", "em contato", "produzindo", "concluído", "cancelado"] as const;
export type CustomStatus = (typeof CUSTOM_STATUS)[number];

export async function listCustomOrders(limit = 100) {
  const db = await getDb();
  return db.select().from(customOrders).orderBy(desc(customOrders.createdAt)).limit(limit);
}

export async function setCustomStatus(id: number, status: string): Promise<boolean> {
  if (!(CUSTOM_STATUS as readonly string[]).includes(status)) return false;
  const db = await getDb();
  const done = await db.update(customOrders).set({ status }).where(eq(customOrders.id, id)).returning({ id: customOrders.id });
  return done.length > 0;
}

// ---------- Produtos ----------

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

// "89,90" ou "1.299,90" (padrão brasileiro) ou "89.90" → centavos inteiros.
export function parsePriceToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
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

  const stock = Number(get("stock"));
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return { ok: false, error: "Estoque deve ser um número inteiro, 0 ou mais." };

  const category = get("category");
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Categoria inválida." };

  const sizes = parseList(get("sizes"), "Tamanhos");
  if (typeof sizes === "string") return { ok: false, error: sizes };
  const colors = parseList(get("colors"), "Cores");
  if (typeof colors === "string") return { ok: false, error: colors };

  const image = get("image");
  if (image && !/^\/products\/[\w.-]+$/.test(image)) {
    return { ok: false, error: "A foto deve ser um caminho como /products/arquivo.png." };
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
      stock: p.stock,
      image: p.image,
      photoBg: p.photoBg,
      active: p.active,
      updatedAt: new Date(),
    })
    .where(eq(products.slug, p.slug))
    .returning({ slug: products.slug });
  return done.length > 0;
}

// ---------- Painel inicial ----------

export async function dashboardStats() {
  const db = await getDb();
  const byStatus = await db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status);
  const [novas] = await db.select({ n: count() }).from(customOrders).where(eq(customOrders.status, "novo"));
  const lowStock = await db
    .select({ slug: products.slug, name: products.name, stock: products.stock })
    .from(products)
    .where(and(eq(products.active, true), lte(products.stock, 3)))
    .orderBy(asc(products.stock));
  const latest = await listOrders(undefined, 5);

  const n = (s: OrderStatus) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    pendentes: n("pendente"),
    pagos: n("pago"),
    enviados: n("enviado"),
    novasEncomendas: novas.n,
    lowStock,
    latest,
  };
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
