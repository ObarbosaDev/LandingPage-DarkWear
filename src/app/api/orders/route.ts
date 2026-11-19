// ============================================================================
// API: POST /api/orders  — fechar o pedido de peças prontas.
//
// Quem chama: a tela /carrinho, quando o cliente clica em "Finalizar pelo WhatsApp".
// O que faz, em ordem:
//   1. confere o limite de uso (anti-abuso);
//   2. lê os itens enviados;
//   3. registra o pedido no banco e baixa o estoque (tudo ou nada);
//   4. devolve o número do pedido e o link do WhatsApp com a mensagem pronta.
// O navegador então redireciona o cliente para esse link.
// ============================================================================

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { buildCartMessage, whatsappLink } from "@/lib/whatsapp";
import { OrderError, createOrder } from "@/server/orders";
import { clientKey, rateLimit } from "@/server/rate-limit";

/** Resposta padrão de "muitas chamadas": 429 + o cabeçalho Retry-After (em quantos segundos tentar de novo). */
function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Muitos pedidos em pouco tempo. Tente de novo em alguns minutos." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}


// POST /api/orders  →  registra o pedido, baixa o estoque e devolve o link do WhatsApp para fechar.
export async function POST(request: Request) {
  // 10 pedidos a cada 10 minutos por origem: impede esgotar o estoque com pedidos falsos em série.
  // O limite vem ANTES de qualquer outro trabalho: quem abusa não gasta nem o banco de pedidos.
  const limite = await rateLimit("orders", await clientKey(), 10, 10 * 60 * 1000);
  if (!limite.allowed) return tooMany(limite.retryAfterSeconds);

  // Lê o corpo (JSON). Se vier quebrado ou vazio, responde 400 (requisição malformada).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    // Só os "items" são usados do que veio: preços e totais enviados pelo navegador são ignorados.
    const order = await createOrder((body as { items?: unknown })?.items);

    // O estoque mudou: o catálogo precisa refletir isso já na próxima leitura (sem servir valor antigo).
    revalidateTag("products", { expire: 0 });

    // Monta o texto do WhatsApp com os valores calculados pelo servidor.
    const message = buildCartMessage(
      order.items.map((i) => ({
        name: i.name,
        size: i.size,
        color: i.color,
        qty: i.qty,
        priceCents: i.unitPriceCents,
      })),
    );

    // 201 = criado. O navegador usa "whatsappUrl" para abrir a conversa.
    return NextResponse.json(
      {
        id: order.number,
        totalCents: order.totalCents,
        whatsappUrl: whatsappLink(`Pedido ${order.number}\n\n${message}`),
      },
      { status: 201 },
    );
  } catch (e) {
    // Erro de regra de negócio (sem estoque, item inválido...): a mensagem é do cliente, vai como está.
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    // Qualquer outro erro é inesperado: vai para o log do servidor, e o cliente recebe uma mensagem
    // genérica (detalhes técnicos nunca devem aparecer na tela).
    console.error("Falha ao registrar pedido:", e);
    return NextResponse.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }
}
