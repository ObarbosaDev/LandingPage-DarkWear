// ============================================================================
// API: GET /api/conta/dados  — "Baixar meus dados" (LGPD): um arquivo JSON com tudo o que a loja guarda da pessoa.
//
// Quem chama: o botão "Baixar meus dados" de /conta. Só entrega os dados de QUEM ESTÁ LOGADO (a rota não recebe id
// nenhum: nada na requisição escolhe a conta). Limite de 5 downloads por hora por conta, e a resposta nunca é guardada
// em cache (nem pelo navegador nem por intermediários).
// ============================================================================

import { NextResponse, connection } from "next/server";
import { exportCustomerData } from "@/server/customers/export";
import { currentCustomer } from "@/server/customers/session";
import { rateLimit } from "@/server/rate-limit";

export async function GET() {
  // Depende de quem está logado e da hora: nunca calculada no build.
  await connection();

  const cliente = await currentCustomer();
  if (!cliente) return NextResponse.json({ error: "Entre na sua conta para baixar os seus dados." }, { status: 401 });
  // Quem entrou com senha provisória só pode trocá-la (igual ao resto da conta).
  if (cliente.mustChangePassword) return NextResponse.json({ error: "Troque a senha provisória antes de baixar os seus dados." }, { status: 403 });

  // 5 por hora por conta: quem roubou uma sessão não consegue varrer os dados em série.
  const limite = await rateLimit("customer-export", String(cliente.id), 5, 60 * 60 * 1000);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Você já baixou os dados várias vezes. Tente de novo mais tarde." }, { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } });
  }

  const dados = await exportCustomerData(cliente.id);
  if (!dados) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const dia = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(dados, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-darkwear-${dia}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
