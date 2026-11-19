import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { NEXT_STATUS, listOrders } from "@/lib/admin-data";
import { ORDER_STATUS, type OrderStatus } from "@/db/schema";
import { formatBRL } from "@/lib/site";
import { changeOrderStatusAction } from "@/app/admin/actions";
import { ConfirmButton } from "../ConfirmButton";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: "Pedidos" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ status?: string; aviso?: string }> }) {
  await requireAdmin();
  const { status, aviso } = await searchParams;
  const filtro = ORDER_STATUS.find((s) => s === status);
  const pedidos = await listOrders(filtro);

  const chip = (on: boolean) =>
    `border-2 border-foreground px-4 py-2 text-base font-medium transition-colors ${
      on ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"
    }`;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Pedidos</h1>

      {aviso === "mudou" ? (
        <p role="alert" className="border-2 border-foreground p-4 text-lg font-bold">
          Esse pedido já foi alterado por outra pessoa, ou a mudança não é permitida. A lista foi atualizada.
        </p>
      ) : null}

      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        <Link href="/admin/pedidos" className={chip(!filtro)}>
          Todos
        </Link>
        {ORDER_STATUS.map((s) => (
          <Link key={s} href={`/admin/pedidos?status=${s}`} className={`${chip(filtro === s)} capitalize`}>
            {s}
          </Link>
        ))}
      </nav>

      {pedidos.length === 0 ? (
        <p className="text-xl font-medium">Nenhum pedido {filtro ? `com status "${filtro}"` : "ainda"}.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {pedidos.map((o) => (
            <article key={o.id} className="border-2 border-foreground">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground p-5">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-4xl uppercase leading-none">{o.number}</h2>
                  <p className="mt-1 text-base font-medium">{dataHora.format(o.createdAt)}</p>
                </div>
                <span className="border-2 border-foreground px-3 py-1 font-mono text-sm uppercase">{o.status}</span>
              </header>

              <ul className="p-5">
                {o.items.map((i, k) => (
                  <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-lg font-medium">
                    <span>
                      {i.qty}× {i.name} · {i.color}, {i.size}
                    </span>
                    <span>{formatBRL((i.unitPriceCents * i.qty) / 100)}</span>
                  </li>
                ))}
              </ul>

              <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground p-5">
                <p className="font-[family-name:var(--font-display)] text-4xl leading-none">{formatBRL(o.totalCents / 100)}</p>
                <div className="flex flex-wrap gap-3">
                  {NEXT_STATUS[o.status as OrderStatus].length === 0 ? (
                    <span className="text-lg font-medium">Pedido encerrado.</span>
                  ) : (
                    NEXT_STATUS[o.status as OrderStatus].map((next) => (
                      <form key={next} action={changeOrderStatusAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="next" value={next} />
                        {next === "cancelado" ? (
                          <ConfirmButton
                            message="Cancelar este pedido? As peças voltam ao estoque e isso não pode ser desfeito."
                            className="border-2 border-foreground px-5 py-3 text-base font-medium transition-colors hover:bg-foreground hover:text-background"
                          >
                            Cancelar pedido
                          </ConfirmButton>
                        ) : (
                          <button
                            type="submit"
                            className="border-2 border-foreground bg-foreground px-5 py-3 text-base font-bold text-background transition-colors hover:bg-transparent hover:text-foreground"
                          >
                            Marcar como {next}
                          </button>
                        )}
                      </form>
                    ))
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
