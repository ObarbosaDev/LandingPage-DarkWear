import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { buildCartMessage, whatsappLink } from "@/lib/whatsapp";
import { OrderError, createOrder } from "@/lib/orders";

// POST /api/orders  →  registra o pedido, baixa o estoque e devolve o link do WhatsApp para fechar.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const order = await createOrder((body as { items?: unknown })?.items);

    // O estoque mudou: o catálogo precisa refletir isso já na próxima leitura (sem servir valor antigo).
    revalidateTag("products", { expire: 0 });

    const message = buildCartMessage(
      order.items.map((i) => ({
        name: i.name,
        size: i.size,
        color: i.color,
        qty: i.qty,
        price: i.unitPriceCents / 100,
      })),
    );

    return NextResponse.json(
      {
        id: order.number,
        total: order.totalCents / 100,
        whatsappUrl: whatsappLink(`Pedido ${order.number}\n\n${message}`),
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Falha ao registrar pedido:", e);
    return NextResponse.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }
}
