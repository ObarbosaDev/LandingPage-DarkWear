import { NextResponse } from "next/server";
import { buildCartMessage, whatsappLink } from "@/lib/whatsapp";
import { createOrder, validateCart } from "@/lib/orders";

// POST /api/orders  →  registra o pedido e devolve o link do WhatsApp para fechar.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const checked = validateCart((body as { items?: unknown })?.items);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });

  const order = createOrder(checked.items);
  const message = buildCartMessage(
    order.items.map((i) => ({
      name: i.name,
      size: i.size,
      color: i.color,
      qty: i.qty,
      price: i.unitPrice,
    })),
  );

  return NextResponse.json(
    { id: order.id, total: order.total, whatsappUrl: whatsappLink(`Pedido ${order.id}\n\n${message}`) },
    { status: 201 },
  );
}
