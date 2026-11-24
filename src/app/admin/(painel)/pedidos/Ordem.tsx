// ============================================================================
// ORDEM: o cartão de UM pedido na esteira de /admin/pedidos.
//
// A ideia: cada pedido é uma ORDEM DE SERVIÇO de papel branco (o mesmo papel de máquina do recibo e da sacola),
// com o número, há quanto tempo chegou, quem comprou, as peças e o valor. O botão do passo seguinte
// ("Marcar como pago →") fica no próprio cartão, então o pedido ANDA pela esteira com um clique.
// Os detalhes (itens, contato, pagamento, histórico) ficam recolhidos em "Detalhes" para o cartão ser curto.
//
// É componente de servidor: os botões são formulários que chamam changeOrderStatusAction (src/app/admin/actions.ts),
// que confere o acesso do administrador por conta própria.
// ============================================================================

import { changeOrderStatusAction } from "@/app/admin/actions";
import { formatCents } from "@/lib/money";
import { installmentsLabel, methodLabel } from "@/lib/payment-labels";
import { tempoRelativo } from "@/lib/relative-time";
import { clienteWhatsappLink } from "@/lib/whatsapp";
import { NEXT_STATUS, type AdminOrder } from "@/server/admin/orders";
import type { StatusOrigin } from "@/server/db/schema";
import { ConfirmButton } from "../ConfirmButton";

// Formata a data/hora no padrão brasileiro e no fuso de São Paulo (o servidor pode estar em outro fuso).
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// Texto legível de quem fez cada mudança de status (o banco guarda só o código curto).
const ORIGEM: Record<StatusOrigin, string> = { pedido: "cliente", painel: "painel", expiracao: "prazo", pagamento: "pagamento" };

export function Ordem({ o }: { o: AdminOrder }) {
  // O passo seguinte do fluxo (pendente → pago → enviado → entregue). "cancelado" é tratado à parte.
  const proximo = NEXT_STATUS[o.status].find((s) => s !== "cancelado");
  const podeCancelar = NEXT_STATUS[o.status].includes("cancelado");
  const pecas = o.items.reduce((n, i) => n + i.qty, 0);
  const primeiro = o.items[0];
  const zap = o.customer ? clienteWhatsappLink(o.customer.phone, `Olá, ${o.customer.name.split(" ")[0]}! Sobre o seu pedido ${o.number} na DarkWear:`) : null;
  const pagamentosVisiveis = o.payments.filter((p) => p.status !== "iniciado");

  return (
    <article id={o.number} className="bg-foreground text-background">
      <div className="p-4 font-mono">
        {/* Topo da ordem: número e há quanto tempo chegou. */}
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-background pb-2">
          <h3 className="text-lg font-bold">{o.number}</h3>
          <span className="text-xs font-bold uppercase tracking-[0.1em]" title={dataHora.format(o.createdAt)}>
            {tempoRelativo(o.createdAt)}
          </span>
        </div>

        {/* Alerta: o cliente pagou e o pedido não ficou pago. Faixa preta no papel branco, impossível de não ver. */}
        {o.alerta && (
          <p role="alert" className="mt-3 bg-background p-2 text-xs font-bold uppercase leading-snug tracking-[0.06em] text-foreground">
            {o.alerta === "cancelado" ? "Cliente pagou, mas o pedido está cancelado. Estorne ou refaça." : "Pagamento aprovado com valor diferente do pedido. Confira no Mercado Pago."}
          </p>
        )}

        {/* Quem comprou e o que comprou. */}
        <p className="mt-3 font-display text-3xl uppercase leading-none">{o.customer?.name ?? "Cliente antigo"}</p>
        <p className="mt-2 text-sm font-bold">
          {primeiro ? `${primeiro.qty}× ${primeiro.name}` : "—"}
          {o.items.length > 1 ? ` + ${o.items.length - 1} ${o.items.length - 1 === 1 ? "item" : "itens"}` : ""}
        </p>
        <p className="text-xs font-bold uppercase tracking-[0.08em]">
          {pecas} {pecas === 1 ? "peça" : "peças"}
          {pagamentosVisiveis.length > 0 ? ` · ${methodLabel(pagamentosVisiveis.at(-1)!.method)}` : " · WhatsApp"}
        </p>

        {/* O valor, com pontilhado, como no recibo. */}
        <div className="mt-3 flex items-end gap-2 border-t-2 border-dashed border-background pt-3">
          <span className="text-xs font-bold uppercase tracking-[0.12em]">Total</span>
          <span aria-hidden="true" className="mb-1 flex-1 border-b-2 border-dotted border-background" />
          <span className="font-display text-3xl leading-none">{formatCents(o.totalCents)}</span>
        </div>

        {/* As ações: avançar na esteira e cancelar. Pedido entregue ou cancelado está encerrado. */}
        {(proximo || podeCancelar) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {proximo && (
              <form action={changeOrderStatusAction} className="flex-1">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="next" value={proximo} />
                <button
                  type="submit"
                  className="w-full border-2 border-background bg-background px-3 py-2.5 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background"
                >
                  Marcar como {proximo} →
                </button>
              </form>
            )}
            {podeCancelar && (
              <form action={changeOrderStatusAction}>
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="next" value="cancelado" />
                {/* Cancelar pergunta antes: não tem volta e devolve as peças ao estoque. */}
                <ConfirmButton
                  message="Cancelar este pedido? As peças voltam ao estoque e isso não pode ser desfeito."
                  className="border-2 border-background px-3 py-2.5 text-sm font-bold uppercase transition-colors hover:bg-background hover:text-foreground"
                >
                  Cancelar
                </ConfirmButton>
              </form>
            )}
          </div>
        )}

        {/* Detalhes recolhidos: itens, contato, pagamento e histórico. */}
        <details className="mt-4 border-t-2 border-dashed border-background pt-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.15em] underline underline-offset-4">Detalhes</summary>

          <ul className="mt-3 flex flex-col gap-1 text-sm font-bold">
            {o.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-3">
                <span>
                  {i.qty}× {i.name} · {i.color}, {i.size}
                </span>
                <span>{formatCents(i.unitPriceCents * i.qty)}</span>
              </li>
            ))}
          </ul>

          {o.customer && (
            <p className="mt-3 break-all text-sm font-bold">
              {o.customer.email}
              {zap ? (
                <>
                  {" · "}
                  <a href={zap} className="underline underline-offset-4">
                    Chamar no WhatsApp
                  </a>
                </>
              ) : null}
            </p>
          )}

          {pagamentosVisiveis.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-xs font-bold uppercase tracking-[0.06em]">
              {pagamentosVisiveis.map((p, k) => (
                <li key={k}>
                  Pagamento {p.status} · {methodLabel(p.method)}
                  {installmentsLabel(p.method, p.installments) ? ` · ${installmentsLabel(p.method, p.installments)}` : ""}
                  {p.amountCents != null ? ` · ${formatCents(p.amountCents)}` : ""}
                </li>
              ))}
            </ul>
          )}

          <ol className="mt-3 flex flex-col gap-1 text-xs font-bold uppercase tracking-[0.06em]">
            {o.history.map((h, k) => (
              <li key={k}>
                {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : "criado"} · {ORIGEM[h.origin]} · {dataHora.format(h.at)}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </article>
  );
}
