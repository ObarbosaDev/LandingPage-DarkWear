import { NextResponse } from "next/server";
import { buildCustomMessage, whatsappLink } from "@/lib/whatsapp";
import { saveCustomOrder, validateCustom } from "@/server/custom-orders";
import { clientKey, rateLimit } from "@/server/rate-limit";

function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Muitos pedidos em pouco tempo. Tente de novo em alguns minutos." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}


// POST /api/custom-orders  →  valida e registra a encomenda personalizada e devolve o link do WhatsApp.
// O arquivo da arte não passa por aqui: o cliente anexa no WhatsApp. Só o nome do arquivo é guardado.
export async function POST(request: Request) {
  const limite = await rateLimit("custom-orders", await clientKey(), 5, 10 * 60 * 1000);
  if (!limite.allowed) return tooMany(limite.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const checked = validateCustom(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });

  try {
    const saved = await saveCustomOrder(checked.order);
    return NextResponse.json(
      {
        id: saved.number,
        whatsappUrl: whatsappLink(`Encomenda ${saved.number}\n\n${buildCustomMessage(checked.order)}`),
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("Falha ao registrar encomenda:", e);
    return NextResponse.json({ error: "Não foi possível registrar a encomenda." }, { status: 500 });
  }
}
