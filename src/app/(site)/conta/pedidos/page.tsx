// ============================================================================
// Página MEUS PEDIDOS: /conta/pedidos
//
// A ideia: os pedidos PENDURADOS NA ARARA. Cada pedido é uma etiqueta de papel branco com o número, a
// situação em letras gigantes (Aguardando, Pago, Enviado...) e o valor. Clicar numa etiqueta abre o
// comprovante daquele pedido.
//
// Mostra SÓ os pedidos de quem está logado (listCustomerOrders filtra por cliente no banco).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { Arara, Etiqueta } from "@/components/conta/Arara";
import { formatCents } from "@/lib/money";
import { palavraDoStatus } from "@/lib/order-labels";
import { listCustomerOrders } from "@/server/customers/orders";
import { requireCustomer } from "@/server/customers/session";

export const metadata: Metadata = { title: "Meus pedidos", robots: { index: false } };

// Página privada de cada cliente: lê o cookie e o banco a cada visita, sem casca estática.
export const instant = false;

const dataCurta = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PedidosPage() {
  const cliente = await requireCustomer("/conta/pedidos");
  const pedidos = await listCustomerOrders(cliente.id);

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-14 md:pt-20">
        <Link href="/conta" className="font-mono text-sm font-bold uppercase tracking-[0.15em] underline underline-offset-4">
          ← Sua conta
        </Link>
        <h1 className="mt-6 font-display text-[clamp(3.5rem,11vw,10rem)] uppercase leading-[0.86]">
          Meus
          <br />
          pedidos
        </h1>

        {pedidos.length === 0 ? (
          <div className="mt-12 max-w-xl border-t-2 border-foreground pt-8">
            <p className="font-display text-5xl uppercase leading-none">Arara vazia.</p>
            <p className="mt-4 text-xl font-medium">Você ainda não fez nenhum pedido. Escolha uma peça e ela aparece aqui.</p>
            <Link
              href="/loja"
              className="mt-6 inline-block border-2 border-foreground px-6 py-3 font-display text-xl uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
            >
              Ir para a loja
            </Link>
          </div>
        ) : (
          <Arara>
            {pedidos.map((p) => (
              <Etiqueta key={p.number} titulo={`Pedido ${p.number}`}>
                <Link href={`/conta/pedidos/${p.number}`} className="group block">
                  <p className="font-display text-[clamp(2.75rem,6vw,4rem)] uppercase leading-[0.9]">{palavraDoStatus(p.status)}</p>
                  <dl className="mt-4 flex flex-col gap-1 font-mono text-sm font-bold">
                    <div className="flex justify-between gap-4">
                      <dt>Feito em</dt>
                      <dd>{dataCurta.format(p.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>{p.itemCount === 1 ? "1 peça" : `${p.itemCount} peças`}</dt>
                      <dd>{formatCents(p.totalCents)}</dd>
                    </div>
                  </dl>
                  <span className="mt-5 inline-block border-b-2 border-background text-base font-bold transition-transform group-hover:translate-x-1">Ver pedido →</span>
                </Link>
              </Etiqueta>
            ))}
          </Arara>
        )}
      </div>
    </section>
  );
}
