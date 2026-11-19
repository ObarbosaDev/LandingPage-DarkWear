// ============================================================================
// API: POST /api/webhooks/mercadopago  — o aviso (webhook) do Mercado Pago.
//
// Quem chama: os servidores do Mercado Pago, sempre que um pagamento nosso muda de situação
// (aprovado, recusado, estornado...). Não é chamada por nenhuma tela.
//
// O que faz:
//   1. confere a assinatura do aviso (se MERCADOPAGO_WEBHOOK_SECRET estiver definida);
//   2. lê o número do pagamento e ignora avisos que não são de pagamento;
//   3. manda aplicar o pagamento ao pedido (src/server/payments/index.ts), que CONSULTA o Mercado
//      Pago antes de acreditar em qualquer coisa;
//   4. responde 200 rapidamente. Qualquer erro nosso devolve 500, e o Mercado Pago tenta de novo.
//
// O aviso em si não é confiável (qualquer um pode mandar um POST para cá): ele serve só como "olhe
// o pagamento número X". Quem decide é a consulta feita com o nosso token.
// ============================================================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PagamentoError, assinaturaValida, mpConfigurado } from "@/server/payments/mercadopago";
import { applyPayment } from "@/server/payments";

export async function POST(request: Request) {
  // Sem Mercado Pago configurado não há o que fazer. 503 = "indisponível" (ele tenta de novo depois).
  if (!mpConfigurado()) return NextResponse.json({ error: "Pagamento online não configurado." }, { status: 503 });

  const url = new URL(request.url);
  // O corpo é JSON; se vier quebrado, seguimos só com a URL (o número também vem em "?data.id=").
  const body = (await request.json().catch(() => null)) as { type?: unknown; data?: { id?: unknown } } | null;

  const tipo = url.searchParams.get("type") ?? (typeof body?.type === "string" ? body.type : null);
  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);

  // Assinatura: protege contra avisos forjados e contra enchente de chamadas falsas ao Mercado Pago.
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (segredo) {
    const ok = assinaturaValida({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secret: segredo,
    });
    if (!ok) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  // Outros tipos de aviso (ex.: pedido comercial, reclamações) não nos interessam: 200 para ele não reenviar.
  if (tipo !== "payment" || !dataId) return NextResponse.json({ ignored: true });

  try {
    const resultado = await applyPayment(dataId);
    // Casos que exigem o olho do dono: ficam no log do servidor, com o número do pagamento.
    if (resultado === "valor-divergente" || resultado === "pedido-cancelado") {
      console.warn(`Pagamento ${dataId} aprovado, mas o pedido NÃO foi marcado como pago (${resultado}). Confira no painel e no Mercado Pago.`);
    }
    // O pedido mudou: as telas do painel precisam mostrar o status novo.
    if (resultado === "pago") revalidatePath("/admin", "layout");
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    // O Mercado Pago não conhece esse pagamento (ex.: o botão "Simular" usa um número de teste).
    // Repetir não adianta: 200, para ele parar de reenviar.
    if (e instanceof PagamentoError && (e.status === 404 || e.status === 400)) return NextResponse.json({ ignored: true });
    // Qualquer outro problema (rede, banco): 500, e o Mercado Pago reenvia mais tarde.
    console.error("Falha ao aplicar o pagamento:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Falha ao processar o aviso." }, { status: 500 });
  }
}
