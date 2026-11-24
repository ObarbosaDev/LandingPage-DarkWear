// ============================================================================
// API: POST /api/orders  — fechar o pedido de peças prontas.
//
// Quem chama: a tela /carrinho, quando o cliente clica em "Finalizar pelo WhatsApp".
// O que faz, em ordem:
//   1. confere o limite de uso (anti-abuso);
//   1b. exige que o cliente esteja logado (401 sem sessão): comprar exige conta, e o pedido fica no
//       nome de quem está logado. O dono do pedido vem SÓ da sessão: nada no corpo da requisição o altera;
//   2. lê os itens enviados;
//   3. registra o pedido no banco e baixa o estoque (tudo ou nada);
//   4. devolve o número do pedido e o link do WhatsApp com a mensagem pronta;
//   5. se o cliente escolheu pagar online ("payment": "online"), abre a cobrança no Mercado Pago e
//      devolve também "paymentUrl". Se a cobrança não abrir, o pedido é cancelado na hora e as
//      peças voltam ao estoque (o cliente não fica com um pedido "fantasma").
// O navegador então redireciona o cliente para o link escolhido.
// ============================================================================

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { buildCartMessage, whatsappLink } from "@/lib/whatsapp";
import { OrderError, cancelOrder, createOrder } from "@/server/orders";
import { getAddress } from "@/server/customers/address";
import { currentCustomer } from "@/server/customers/session";
import { startPayment } from "@/server/payments";
import { mpConfigurado } from "@/server/payments/mercadopago";
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

  // Comprar exige conta. Conferido ANTES de qualquer outro trabalho: sem sessão válida, nenhum estoque é
  // tocado e o Mercado Pago nem é chamado. A tela de sacola, ao receber 401, leva a pessoa a entrar.
  const cliente = await currentCustomer();
  if (!cliente) return NextResponse.json({ error: "Entre na sua conta para comprar." }, { status: 401 });
  // Quem entrou com uma senha provisória (gerada pelo painel) só pode trocá-la: comprar fica fechado até lá.
  if (cliente.mustChangePassword) {
    return NextResponse.json({ error: "Troque a senha provisória em Sua conta antes de comprar." }, { status: 403 });
  }

  // Lê o corpo (JSON). Se vier quebrado ou vazio, responde 400 (requisição malformada).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // Comprar exige endereço de entrega. Ele vem SÓ da conta de quem está logado (nunca do corpo da requisição) e o
  // pedido guarda uma cópia. Sem endereço: 422 com um código que a sacola usa para levar a pessoa a cadastrá-lo.
  // Conferido ANTES de criar o pedido, para não baixar estoque à toa.
  const endereco = await getAddress(cliente.id);
  if (!endereco) {
    return NextResponse.json({ error: "Cadastre o endereço de entrega na sua conta antes de comprar.", code: "sem-endereco" }, { status: 422 });
  }

  // Pagamento online só existe se o Mercado Pago estiver configurado. Conferido ANTES de criar o
  // pedido, para não baixar estoque à toa.
  const online = (body as { payment?: unknown })?.payment === "online";
  if (online && !mpConfigurado()) {
    return NextResponse.json({ error: "Pagamento online indisponível. Feche pelo WhatsApp." }, { status: 503 });
  }

  try {
    // Só os "items" são usados do que veio: preços e totais enviados pelo navegador são ignorados.
    const order = await createOrder((body as { items?: unknown })?.items, cliente.id, endereco);

    // O estoque mudou: o catálogo precisa refletir isso já na próxima leitura (sem servir valor antigo).
    revalidateTag("products", { expire: 0 });

    // Pagamento online: abre a cobrança. Se falhar, desfaz o pedido (cancela e devolve o estoque).
    if (online) {
      try {
        const paymentUrl = await startPayment(order.id);
        return NextResponse.json({ id: order.number, totalCents: order.totalCents, paymentUrl }, { status: 201 });
      } catch (e) {
        console.error("Falha ao abrir o pagamento:", e instanceof Error ? e.message : e);
        await cancelOrder(order.id, "pendente", "pedido");
        revalidateTag("products", { expire: 0 });
        return NextResponse.json({ error: "Não foi possível abrir o pagamento. Tente de novo ou feche pelo WhatsApp." }, { status: 502 });
      }
    }

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
