// ============================================================================
// API: GET /api/payments/config  — diz se o pagamento online está disponível.
//
// Quem usa: a tela /carrinho, ao abrir, para decidir se mostra o botão "Pagar com cartão ou Pix".
// Devolve só um sim/não: nada da configuração (token, segredo) sai daqui.
// ============================================================================

import { NextResponse, connection } from "next/server";
import { mpConfigurado } from "@/server/payments/mercadopago";

export async function GET() {
  // connection() marca a rota como dinâmica: sem isso o Next a calcularia UMA vez, no build, e
  // congelaria o valor da variável daquele momento.
  await connection();
  // Sem cache: depende de variável de ambiente, e o dono pode ligar/desligar a qualquer hora.
  return NextResponse.json({ online: mpConfigurado() }, { headers: { "Cache-Control": "no-store" } });
}
