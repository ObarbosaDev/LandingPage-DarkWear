// Regras de pedido compartilhadas pelas rotas de API.
// Persistência: por enquanto em memória (zera a cada deploy/reinício). Trocar por um banco
// (ex.: Postgres via Vercel Marketplace) antes de ir ao ar de verdade.

import { getProduct } from "@/data/products";

export type OrderItemInput = { slug: string; size: string; color: string; qty: number };

export type Order = {
  id: string;
  createdAt: string;
  items: { slug: string; name: string; size: string; color: string; qty: number; unitPrice: number }[];
  total: number;
  status: "pendente_whatsapp";
};

export type CustomOrderInput = {
  name: string;
  model: string;
  color: string;
  size: string;
  placement: string;
  notes?: string;
  fileName?: string;
};

const PLACEMENT_IDS = ["peito", "frente", "costas", "manga"] as const;

const MODELS = ["Camiseta", "Moletom", "Oversized"] as const;
const SIZES = ["P", "M", "G", "GG", "XG"] as const;

export function validateCart(input: unknown):
  | { ok: true; items: OrderItemInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Carrinho vazio." };
  if (input.length > 50) return { ok: false, error: "Carrinho muito grande." };

  const items: OrderItemInput[] = [];
  for (const raw of input) {
    const r = raw as Partial<OrderItemInput>;
    const product = typeof r.slug === "string" ? getProduct(r.slug) : undefined;
    if (!product) return { ok: false, error: "Produto inválido no carrinho." };
    if (typeof r.size !== "string" || !product.sizes.includes(r.size))
      return { ok: false, error: `Tamanho inválido para ${product.name}.` };
    if (typeof r.color !== "string" || !product.colors.includes(r.color))
      return { ok: false, error: `Cor inválida para ${product.name}.` };
    const qty = Number(r.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > product.stock)
      return { ok: false, error: `Quantidade indisponível para ${product.name}.` };
    items.push({ slug: product.slug, size: r.size, color: r.color, qty });
  }
  return { ok: true, items };
}

export function validateCustom(input: unknown):
  | { ok: true; order: CustomOrderInput }
  | { ok: false; error: string } {
  const r = (input ?? {}) as Partial<CustomOrderInput>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const model = str(r.model, 30);
  const color = str(r.color, 30);
  const size = str(r.size, 5);
  const name = str(r.name, 60);
  const notes = str(r.notes, 500);
  const fileName = str(r.fileName, 120);

  if (!(MODELS as readonly string[]).includes(model)) return { ok: false, error: "Modelo inválido." };
  if (!(SIZES as readonly string[]).includes(size)) return { ok: false, error: "Tamanho inválido." };
  if (!color) return { ok: false, error: "Escolha uma cor." };

  const placement = str(r.placement, 20);
  if (!(PLACEMENT_IDS as readonly string[]).includes(placement))
    return { ok: false, error: "Escolha onde a arte vai." };

  return {
    ok: true,
    order: { name, model, color, size, placement, notes, fileName: fileName || undefined },
  };
}

const orders: Order[] = [];

export function createOrder(items: OrderItemInput[]): Order {
  const lines = items.map((i) => {
    const p = getProduct(i.slug)!;
    return { slug: p.slug, name: p.name, size: i.size, color: i.color, qty: i.qty, unitPrice: p.price };
  });
  const order: Order = {
    id: `DW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    items: lines,
    total: lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    status: "pendente_whatsapp",
  };
  orders.push(order);
  return order;
}

export function getOrder(id: string) {
  return orders.find((o) => o.id === id);
}
