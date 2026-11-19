// ============================================================================
// Tela de pedidos do painel: /admin/pedidos.
//
// O que o dono faz aqui: ver todos os pedidos de peças prontas (mais novos primeiro), filtrar por
// status e avançar cada pedido no fluxo (pendente → pago → enviado → entregue) ou cancelá-lo.
// Cancelar devolve as peças ao estoque.
//
// De onde vêm os dados: listOrders (src/server/admin/orders.ts). Os botões chamam
// changeOrderStatusAction (src/app/admin/actions.ts).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/admin/auth";
import { NEXT_STATUS, listOrders } from "@/server/admin/orders";
import { ORDER_STATUS, type OrderStatus, type StatusOrigin } from "@/server/db/schema";
import { formatCents } from "@/lib/money";
import { changeOrderStatusAction } from "@/app/admin/actions";
import { ConfirmButton } from "../ConfirmButton";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: "Pedidos" };

// Formata a data/hora no padrão brasileiro e no fuso de São Paulo (o servidor pode estar em outro fuso).
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// Texto legível de quem fez cada mudança de status (o banco guarda só o código curto).
const ORIGEM: Record<StatusOrigin, string> = { pedido: "cliente", painel: "painel", expiracao: "prazo" };

// searchParams: os parâmetros do endereço. "status" é o filtro escolhido (?status=pago) e "aviso"
// aparece quando uma mudança de status não foi aplicada (?aviso=mudou).
export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ status?: string; aviso?: string }> }) {
  await requireAdmin();
  const { status, aviso } = await searchParams;
  // Só aceita um status que exista; qualquer outro valor no endereço vira "sem filtro".
  const filtro = ORDER_STATUS.find((s) => s === status);
  const pedidos = await listOrders(filtro);

  // Estilo dos botões de filtro: o selecionado fica preenchido, os outros invertem ao passar o mouse.
  const chip = (on: boolean) =>
    `border-2 border-foreground px-4 py-2 text-base font-medium transition-colors ${
      on ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"
    }`;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Pedidos</h1>

      {/* Aviso de conflito: aparece quando o dono tentou mudar um pedido que outra pessoa já mudou
          (ou a mudança não era permitida). Veja changeOrderStatusAction. */}
      {aviso === "mudou" ? (
        <p role="alert" className="border-2 border-foreground p-4 text-lg font-bold">
          Esse pedido já foi alterado por outra pessoa, ou a mudança não é permitida. A lista foi atualizada.
        </p>
      ) : null}

      {/* Filtro por status: cada botão é um link que muda o ?status= do endereço. */}
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
          {/* Um cartão por pedido: cabeçalho (número, data, status), itens e rodapé (total e botões). */}
          {pedidos.map((o) => (
            <article key={o.id} className="border-2 border-foreground">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground p-5">
                <div>
                  <h2 className="font-display text-4xl uppercase leading-none">{o.number}</h2>
                  <p className="mt-1 text-base font-medium">{dataHora.format(o.createdAt)}</p>
                </div>
                <span className="border-2 border-foreground px-3 py-1 font-mono text-sm uppercase">{o.status}</span>
              </header>

              {/* Itens do pedido: quantidade, peça, cor/tamanho e o valor da linha. */}
              <ul className="p-5">
                {o.items.map((i, k) => (
                  <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-lg font-medium">
                    <span>
                      {i.qty}× {i.name} · {i.color}, {i.size}
                    </span>
                    <span>{formatCents(i.unitPriceCents * i.qty)}</span>
                  </li>
                ))}
              </ul>

              {/* Histórico do pedido: cada mudança de status com a data e quem a fez (cliente, painel ou
                  prazo de expiração). Responde "quando esse pedido foi pago?". */}
              <ol className="flex flex-wrap gap-x-6 gap-y-1 border-t-2 border-foreground px-5 py-3 font-mono text-xs uppercase tracking-[0.1em]">
                {o.history.map((h, k) => (
                  <li key={k}>
                    {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : `criado`} · {ORIGEM[h.origin]} · {dataHora.format(h.at)}
                  </li>
                ))}
              </ol>

              <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground p-5">
                <p className="font-display text-4xl leading-none">{formatCents(o.totalCents)}</p>
                {/* Os botões vêm de NEXT_STATUS: cada status só oferece os próximos passos permitidos.
                    Pedido entregue ou cancelado não tem botão (está encerrado). */}
                <div className="flex flex-wrap gap-3">
                  {NEXT_STATUS[o.status as OrderStatus].length === 0 ? (
                    <span className="text-lg font-medium">Pedido encerrado.</span>
                  ) : (
                    NEXT_STATUS[o.status as OrderStatus].map((next) => (
                      // Cada botão é um mini formulário que envia o pedido (id) e o novo status (next).
                      <form key={next} action={changeOrderStatusAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="next" value={next} />
                        {next === "cancelado" ? (
                          // Cancelar pergunta antes: não tem volta e devolve as peças ao estoque.
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
