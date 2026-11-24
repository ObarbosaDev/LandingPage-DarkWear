// ============================================================================
// PORTEIRO do painel: roda ANTES de qualquer página de /admin ser montada.
//
// Por que existe: o layout do painel já confere o acesso (requireAdmin), mas dali o "não encontrado" só pode ser
// lançado depois que a resposta começou a ser enviada. Em produção isso dava status 200 e deixava o título e o
// nome da rota do painel nos dados internos da página, entregando que há um painel. Aqui, quem claramente não é
// administrador recebe a MESMA página 404 de qualquer endereço que não existe, com status 404, e a página do
// painel nem chega a ser montada.
//
// Como decide: lê o cookie da sessão e confere a ASSINATURA, a validade e o papel que o cookie guarda ("admin").
// Isso é só uma dica rápida, feita sem banco. A AUTORIDADE continua sendo o banco: requireAdmin, no layout e em cada
// ação, confere de novo se a conta ainda existe, ainda é administradora e entrou há menos de 12 horas. Então um
// cookie de quem perdeu o papel passa por aqui e é barrado lá.
//
// Vale também para as ações do painel (POST), que passam pelo mesmo endereço.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_CLIENTE, verifySession } from "@/server/customers/token";

// Um endereço que não existe no site: reescrever para ele faz o Next mostrar o 404 de verdade, igual ao de
// qualquer outro endereço inexistente, mantendo o endereço digitado na barra.
const ENDERECO_INEXISTENTE = "/_painel-inexistente";

export function proxy(request: NextRequest) {
  const segredo = process.env.CUSTOMER_SESSION_SECRET;
  const cookie = request.cookies.get(COOKIE_CLIENTE)?.value;
  // Sem segredo configurado, ninguém passa (nunca "aberto").
  const sessao = segredo && cookie ? verifySession(cookie, segredo) : null;

  if (sessao?.role === "admin") return NextResponse.next();
  return NextResponse.rewrite(new URL(ENDERECO_INEXISTENTE, request.url));
}

// Só o painel passa por aqui: o resto do site nem é tocado.
export const config = { matcher: ["/admin", "/admin/:path*"] };
