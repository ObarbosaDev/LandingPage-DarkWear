import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { expirePendingOrders } from "@/server/orders";

// GET /api/cron/expire-orders  →  cancela pedidos pendentes antigos e devolve as peças ao estoque.
// Chamada todo dia pelo cron da Vercel (vercel.json). A Vercel manda "Authorization: Bearer <CRON_SECRET>".
// Sem CRON_SECRET configurado, a rota fica fechada.

const sha = (s: string) => createHash("sha256").update(s).digest();

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });

  const dado = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(sha(dado), sha(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const horas = Number(process.env.PENDING_ORDER_HOURS);
  const cancelados = await expirePendingOrders(Number.isFinite(horas) && horas > 0 ? horas : 48);
  if (cancelados > 0) revalidateTag("products", { expire: 0 }); // as peças voltaram ao estoque

  return NextResponse.json({ cancelados });
}
