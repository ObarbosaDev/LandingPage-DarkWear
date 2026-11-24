// ============================================================================
// API: GET /api/cron/expire-orders  — tarefa diária que cancela pedidos pendentes antigos.
//
// Quem chama: o "cron" da Vercel, todo dia às 9h UTC (agendado em vercel.json). Não é para pessoas.
// Por que existe: pedido pendente segura as peças no estoque. Se o cliente nunca pagou, sem esta
// tarefa a peça ficaria "reservada" para sempre. Aqui o pedido é cancelado e a peça volta à venda.
// ============================================================================

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { expirePendingOrders } from "@/server/orders";

// GET /api/cron/expire-orders  →  cancela pedidos pendentes antigos e devolve as peças ao estoque.
// Chamada todo dia pelo cron da Vercel (vercel.json). A Vercel manda "Authorization: Bearer <CRON_SECRET>".
// Sem CRON_SECRET configurado, a rota fica fechada.

// Resumo SHA-256 de um texto. Comparar os resumos (todos do mesmo tamanho) permite usar
// timingSafeEqual, que não revela o segredo pelo tempo de resposta.
const sha = (s: string) => createHash("sha256").update(s).digest();

export async function GET(request: Request) {
  // Sem segredo configurado a rota fica FECHADA (503), em vez de aberta a qualquer um.
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });

  // A Vercel envia o segredo no cabeçalho Authorization. Qualquer outro valor é recusado (401).
  const dado = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(sha(dado), sha(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // Os prazos vêm de expirePendingOrders: curto para pedidos com cobrança online, e PENDING_ORDER_HOURS (padrão 48)
  // para os combinados pelo WhatsApp.
  const cancelados = await expirePendingOrders();
  if (cancelados > 0) revalidateTag("products", { expire: 0 }); // as peças voltaram ao estoque

  return NextResponse.json({ cancelados });
}
