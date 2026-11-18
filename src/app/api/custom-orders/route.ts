import { NextResponse } from "next/server";
import { buildCustomMessage, whatsappLink } from "@/lib/whatsapp";
import { validateCustom } from "@/lib/orders";

// POST /api/custom-orders  →  valida a encomenda personalizada e devolve o link do WhatsApp.
// O arquivo da arte não passa por aqui: o cliente anexa no WhatsApp.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const checked = validateCustom(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });

  return NextResponse.json(
    { whatsappUrl: whatsappLink(buildCustomMessage(checked.order)) },
    { status: 201 },
  );
}
