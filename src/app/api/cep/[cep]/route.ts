// ============================================================================
// API: GET /api/cep/<cep>  — devolve rua, bairro, cidade e UF de um CEP (consulta ao ViaCEP, feita pelo servidor).
//
// Quem chama: o formulário de endereço de /conta, ao clicar em "Buscar CEP". É só uma comodidade: se falhar, o
// cliente digita o endereço à mão.
//
// Segurança, em ordem:
//   1. só quem está logado consulta (401): a rota não é um serviço aberto de CEP para a internet;
//   2. o CEP precisa ter exatamente 8 dígitos (400), conferido ANTES de qualquer consulta externa;
//   3. limite de 30 consultas a cada 10 minutos por cliente (429);
//   4. a resposta nunca é guardada em cache (cada consulta é de um cliente, e o endereço é dado pessoal);
//   5. falha do serviço externo vira 502 com mensagem genérica (sem detalhes técnicos).
// ============================================================================

import { NextResponse } from "next/server";
import { CepError, lookupCep } from "@/server/cep";
import { currentCustomer } from "@/server/customers/session";
import { rateLimit } from "@/server/rate-limit";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

export async function GET(_req: Request, ctx: { params: Promise<{ cep: string }> }) {
  const cliente = await currentCustomer();
  if (!cliente) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401, headers: SEM_CACHE });

  const { cep } = await ctx.params;
  if (!/^[0-9]{8}$/.test(cep)) return NextResponse.json({ error: "CEP inválido." }, { status: 400, headers: SEM_CACHE });

  const limite = await rateLimit("cep", String(cliente.id), 30, 10 * 60 * 1000);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitas consultas. Digite o endereço ou tente de novo em alguns minutos." }, { status: 429, headers: { ...SEM_CACHE, "Retry-After": String(limite.retryAfterSeconds) } });
  }

  try {
    const achado = await lookupCep(cep);
    if (!achado) return NextResponse.json({ error: "CEP não encontrado." }, { status: 404, headers: SEM_CACHE });
    return NextResponse.json(achado, { headers: SEM_CACHE });
  } catch (e) {
    if (!(e instanceof CepError)) console.error("Falha inesperada ao consultar CEP:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não foi possível consultar o CEP agora. Digite o endereço." }, { status: 502, headers: SEM_CACHE });
  }
}
