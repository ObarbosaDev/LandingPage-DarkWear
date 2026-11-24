// ============================================================================
// Página PEDIDO: /conta/pedidos/DW-00042
//
// A ideia: o COMPROVANTE do pedido, no mesmo papel branco e fonte de máquina da sacola. No topo, a
// situação em letras gigantes; depois as peças com pontilhado até o preço, o total, o pagamento e a linha
// do tempo do pedido (feito, pago, enviado...).
//
// Só o dono do pedido o vê: getCustomerOrder filtra por cliente no banco, e pedido de outra pessoa
// responde "não encontrado", igual a um número que não existe (nada revela que o pedido existe).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@/lib/money";
import { eventoDoPedido, palavraDoStatus } from "@/lib/order-labels";
import { methodLabel, installmentsLabel } from "@/lib/payment-labels";
import { SITE } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";
import { formatAddress } from "@/server/customers/address";
import { getCustomerOrder } from "@/server/customers/orders";
import { requireCustomer } from "@/server/customers/session";

export const metadata: Metadata = { title: "Pedido", robots: { index: false } };

// Página privada de cada cliente: lê o cookie e o banco a cada visita, sem casca estática.
export const instant = false;

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PedidoPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  // Sem sessão, entra e volta para este mesmo pedido (o número só tem letras, dígitos e hífen).
  const cliente = await requireCustomer(`/conta/pedidos/${encodeURIComponent(numero)}`);
  const pedido = await getCustomerOrder(cliente.id, numero);
  if (!pedido) notFound();

  // O pagamento mais recente decide se vale oferecer "tentar de novo".
  const ultimo = pedido.payments.at(-1);
  const recusado = pedido.status === "pendente" && (ultimo?.status === "recusado" || ultimo?.status === "cancelado");

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-14 md:pt-20">
        <Link href="/conta/pedidos" className="font-mono text-sm font-bold uppercase tracking-[0.15em] underline underline-offset-4">
          ← Meus pedidos
        </Link>

        <div className="mt-6 bg-foreground px-6 pb-10 pt-7 font-mono text-background">
          <div className="flex items-baseline justify-between border-b-2 border-dashed border-background pb-4">
            <span className="font-display text-3xl uppercase leading-none">{SITE.name}</span>
            <span className="text-sm uppercase tracking-[0.12em]">Pedido {pedido.number}</span>
          </div>

          <p className="mt-6 text-sm font-bold uppercase tracking-[0.15em]">Feito em {dataHora.format(pedido.createdAt)}</p>
          <h1 className="mt-2 font-display text-[clamp(2.75rem,12vw,7.5rem)] uppercase leading-[0.9] [overflow-wrap:anywhere]">{palavraDoStatus(pedido.status)}</h1>

          {/* As peças: quantidade, nome, pontilhado e valor da linha. */}
          <ul className="mt-6 divide-y-2 divide-dashed divide-background border-y-2 border-dashed border-background">
            {pedido.items.map((i, k) => (
              <li key={k} className="py-4">
                <div className="flex items-end gap-2 text-base font-bold uppercase">
                  <span>
                    {i.qty}x {i.name}
                  </span>
                  <span aria-hidden="true" className="mb-1 flex-1 border-b-2 border-dotted border-background" />
                  <span>{formatCents(i.unitPriceCents * i.qty)}</span>
                </div>
                <p className="mt-1 text-sm uppercase tracking-[0.08em]">
                  {i.color} · tam. {i.size} · {formatCents(i.unitPriceCents)} cada
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-sm font-bold uppercase tracking-[0.15em]">Total</span>
            <span className="font-display text-5xl leading-none">{formatCents(pedido.totalCents)}</span>
          </div>

          {/* Para onde o pedido vai: a cópia do endereço guardada no pedido (pedidos antigos não têm). */}
          {pedido.entrega && (
            <div className="mt-8 border-t-2 border-dashed border-background pt-5">
              <p className="text-sm font-bold uppercase tracking-[0.15em]">Entrega</p>
              <address className="mt-2 flex flex-col gap-0.5 text-base font-medium not-italic">
                {formatAddress(pedido.entrega).map((linha) => (
                  <span key={linha}>{linha}</span>
                ))}
              </address>
            </div>
          )}

          {/* Pagamento online (se houve). Tentativas só "iniciadas" (a página de pagamento aberta e não paga) ficam de fora. */}
          {pedido.payments.filter((p) => p.status !== "iniciado").length > 0 && (
            <div className="mt-8 border-t-2 border-dashed border-background pt-5">
              <p className="text-sm font-bold uppercase tracking-[0.15em]">Pagamento</p>
              <ul className="mt-2 flex flex-col gap-1 text-base font-medium">
                {pedido.payments
                  .filter((p) => p.status !== "iniciado")
                  .map((p, k) => (
                    <li key={k}>
                      <span className="capitalize">{p.status}</span> · {methodLabel(p.method)}
                      {installmentsLabel(p.method, p.installments) ? ` · ${installmentsLabel(p.method, p.installments)}` : ""}
                      {p.amountCents != null ? ` · ${formatCents(p.amountCents)}` : ""}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* A linha do tempo do pedido. */}
          <div className="mt-8 border-t-2 border-dashed border-background pt-5">
            <p className="text-sm font-bold uppercase tracking-[0.15em]">Andamento</p>
            <ol className="mt-2 flex flex-col gap-1 text-base font-medium">
              {pedido.history.map((h, k) => (
                <li key={k} className="flex flex-wrap justify-between gap-x-4">
                  <span>{eventoDoPedido(h.fromStatus, h.toStatus)}</span>
                  <span>{dataHora.format(h.at)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={whatsappLink(
                recusado
                  ? `Olá! O pagamento do pedido ${pedido.number} não passou. Quero tentar de novo.`
                  : `Olá! Quero falar sobre o pedido ${pedido.number}.`,
              )}
              className="border-2 border-background bg-background px-6 py-3 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background"
            >
              {recusado ? "Tentar de novo no WhatsApp" : "Falar sobre este pedido"}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
