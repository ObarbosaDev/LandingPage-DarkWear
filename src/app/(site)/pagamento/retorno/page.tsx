// ============================================================================
// Página PAGAMENTO / RETORNO: /pagamento/retorno?pedido=DW-00042
//
// Para onde o Mercado Pago devolve o cliente depois da página de pagamento (aprovado, pendente ou
// recusado). A ideia visual: um COMPROVANTE de papel com a situação do pedido em letras gigantes,
// no mesmo "recibo" da sacola.
//
// REGRA DE OURO: esta página mostra o que está no BANCO, nunca o que vem na URL. O Mercado Pago
// acrescenta "?status=approved" ao endereço, mas qualquer pessoa poderia digitar isso: só o aviso
// confirmado pelo servidor (webhook) muda o pedido. Enquanto o aviso não chega (o Pix leva alguns
// segundos), a página se atualiza sozinha.
//
// Mostra só a situação: nem itens nem valores, para o número do pedido, que é fácil de adivinhar,
// não revelar o que ninguém além do cliente deveria ver.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";
import { getPaymentView, type PaymentView } from "@/server/payments";

export const metadata: Metadata = { title: "Pagamento", robots: { index: false } };

// Página privada de cada cliente: lê o banco a cada visita, sem casca estática.
export const instant = false;

/** A palavra grande, a explicação e se a página deve continuar se atualizando. */
function leitura(v: PaymentView): { palavra: string; texto: string; esperando: boolean; tentarDeNovo: boolean } {
  switch (v.status) {
    case "pago":
      return { palavra: "Pago", texto: "Pagamento confirmado. Vamos separar a sua peça e chamar no WhatsApp para combinar o envio.", esperando: false, tentarDeNovo: false };
    case "enviado":
      return { palavra: "Enviado", texto: "O pedido já saiu da loja. Qualquer dúvida, é só chamar no WhatsApp.", esperando: false, tentarDeNovo: false };
    case "entregue":
      return { palavra: "Entregue", texto: "Pedido entregue. Obrigado por vestir a gente.", esperando: false, tentarDeNovo: false };
    case "cancelado":
      return { palavra: "Cancelado", texto: "Este pedido foi cancelado e as peças voltaram para a loja. Se você pagou, fale com a gente no WhatsApp.", esperando: false, tentarDeNovo: false };
    default:
      // Pendente: depende do último pagamento tentado.
      if (v.payment === "recusado" || v.payment === "cancelado") {
        return { palavra: "Recusado", texto: "O pagamento não passou. O pedido segue reservado por 48 horas: chame no WhatsApp para tentar outro cartão ou pagar por Pix.", esperando: false, tentarDeNovo: true };
      }
      return { palavra: "Aguardando", texto: "Ainda não recebemos a confirmação do pagamento. Pode levar alguns instantes (o Pix é quase na hora). Esta página se atualiza sozinha.", esperando: true, tentarDeNovo: false };
  }
}

export default async function RetornoPage({ searchParams }: { searchParams: Promise<{ pedido?: string | string[] }> }) {
  const { pedido } = await searchParams;
  const numero = Array.isArray(pedido) ? pedido[0] : pedido;
  const view = numero ? await getPaymentView(numero) : null;
  // Sem número, número inválido ou pedido inexistente: página não encontrada.
  if (!view) notFound();

  const l = leitura(view);

  return (
    <section className="bg-background text-foreground">
      {/* Enquanto espera a confirmação, a página se atualiza sozinha. */}
      {l.esperando && <AutoRefresh />}
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-14 md:pt-20">
        {/* O comprovante: papel branco, fonte de máquina, pontilhado, igual ao recibo da sacola. */}
        <div className="bg-foreground px-6 pb-10 pt-7 font-mono text-background">
          <div className="flex items-baseline justify-between border-b-2 border-dashed border-background pb-4">
            <span className="font-display text-3xl uppercase leading-none">{SITE.name}</span>
            <span className="text-sm uppercase tracking-[0.12em]">Comprovante</span>
          </div>

          <p className="mt-6 text-sm font-bold uppercase tracking-[0.15em]">Pedido {view.number}</p>
          <h1 className="mt-2 font-display text-[clamp(4rem,16vw,10rem)] uppercase leading-[0.86]">{l.palavra}</h1>

          <p className="mt-6 border-t-2 border-dashed border-background pt-5 text-lg font-medium">{l.texto}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {l.tentarDeNovo && (
              <a
                href={whatsappLink(`Olá! O pagamento do pedido ${view.number} não passou. Quero tentar de novo.`)}
                className="border-2 border-background bg-background px-6 py-3 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background"
              >
                Chamar no WhatsApp
              </a>
            )}
            <Link href="/loja" className="border-2 border-background px-6 py-3 font-display text-xl uppercase tracking-wide transition-colors hover:bg-background hover:text-foreground">
              Voltar à loja
            </Link>
          </div>
        </div>
        {/* Faixa serrilhada do papel (enfeite, por isso aria-hidden). */}
        <div
          aria-hidden="true"
          className="h-3 w-full"
          style={{
            background:
              "linear-gradient(135deg, var(--foreground) 50%, transparent 50%) 0 0 / 16px 12px, linear-gradient(225deg, var(--foreground) 50%, transparent 50%) 0 0 / 16px 12px",
            backgroundRepeat: "repeat-x",
          }}
        />
      </div>
    </section>
  );
}
