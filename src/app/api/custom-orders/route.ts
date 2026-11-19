// ============================================================================
// API: POST /api/custom-orders  — enviar uma encomenda com a arte do cliente.
//
// Quem chama: a tela /personalizar, no botão "Finalizar pelo WhatsApp".
// O que faz: confere o limite de uso, valida as opções escolhidas, registra a encomenda e devolve
// o link do WhatsApp com o resumo pronto. O arquivo da arte NÃO passa por aqui.
// ============================================================================

import { NextResponse } from "next/server";
import { buildCustomMessage, whatsappLink } from "@/lib/whatsapp";
import { saveCustomOrder, validateCustom } from "@/server/custom-orders";
import { clientKey, rateLimit } from "@/server/rate-limit";

/** Resposta padrão de "muitas chamadas": 429 + Retry-After (a mesma da rota de pedidos). */
function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Muitos pedidos em pouco tempo. Tente de novo em alguns minutos." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}


// POST /api/custom-orders  →  valida e registra a encomenda personalizada e devolve o link do WhatsApp.
// O arquivo da arte não passa por aqui: o cliente anexa no WhatsApp. Só o nome do arquivo é guardado.
export async function POST(request: Request) {
  // Limite menor que o dos pedidos (5 em 10 min): encomenda é mais rara e cada uma dá trabalho ao dono.
  const limite = await rateLimit("custom-orders", await clientKey(), 5, 10 * 60 * 1000);
  if (!limite.allowed) return tooMany(limite.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // 422 = a requisição está bem formada, mas os dados não são aceitáveis (ex.: cor fora da lista).
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
