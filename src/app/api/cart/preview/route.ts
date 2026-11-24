// ============================================================================
// API: POST /api/cart/preview  — a PRÉVIA da sacola: quanto o cliente pagaria, com o cupom e o Pix.
//
// Quem chama: a tela /carrinho, quando o cliente aplica um cupom ou escolhe pagar por Pix.
// O que faz: calcula o valor com os preços do banco e as MESMAS regras do pedido de verdade (calcularPrevia), sem
// registrar pedido, mexer em estoque nem gastar o cupom. Quem manda no valor cobrado continua sendo o pedido.
//
// Proteções: exige conta (um cupom não pode ser testado por qualquer visitante: sem isso, dava para descobrir os códigos
// existentes por tentativa e erro) e tem limite de uso por origem.
// ============================================================================

import { NextResponse } from "next/server";
import { currentCustomer } from "@/server/customers/session";
import { OrderError, calcularPrevia } from "@/server/orders";
import { clientKey, rateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  // 30 prévias a cada 10 minutos por origem: o suficiente para conferir cupons, pouco para varrer códigos.
  const limite = await rateLimit("cart-preview", await clientKey(), 30, 10 * 60 * 1000);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo em alguns minutos." }, { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } });
  }

  const cliente = await currentCustomer();
  if (!cliente) return NextResponse.json({ error: "Entre na sua conta para usar um cupom." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const b = (body ?? {}) as { items?: unknown; coupon?: unknown; pix?: unknown };

  try {
    const previa = await calcularPrevia(b.items, cliente.id, { coupon: typeof b.coupon === "string" ? b.coupon : undefined, pix: b.pix === true });
    return NextResponse.json(previa, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Falha ao calcular a prévia da sacola:", e);
    return NextResponse.json({ error: "Não foi possível calcular o valor." }, { status: 500 });
  }
}
