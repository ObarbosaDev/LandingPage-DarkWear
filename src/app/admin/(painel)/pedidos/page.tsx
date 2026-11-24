// ============================================================================
// Tela de pedidos do painel: /admin/pedidos.
//
// O que o dono faz aqui: ver todos os pedidos de peças prontas (mais novos primeiro), BUSCAR por número ou por
// nome/e-mail do cliente, filtrar por status (ou só os "para conferir": cliente que pagou e o pedido não ficou
// pago) e avançar cada pedido no fluxo (pendente → pago → enviado → entregue) ou cancelá-lo.
// Cancelar devolve as peças ao estoque. Cada pedido mostra quem comprou, com link para chamar no WhatsApp.
//
// De onde vêm os dados: listOrders (src/server/admin/orders.ts). Os botões chamam
// changeOrderStatusAction (src/app/admin/actions.ts).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { clienteWhatsappLink } from "@/lib/whatsapp";
import { requireAdmin } from "@/server/admin/auth";
import { NEXT_STATUS, listOrders } from "@/server/admin/orders";
import { ORDER_STATUS, type OrderStatus, type StatusOrigin } from "@/server/db/schema";
import { formatCents } from "@/lib/money";
import { installmentsLabel, methodLabel } from "@/lib/payment-labels";
import { changeOrderStatusAction } from "@/app/admin/actions";
import { ConfirmButton } from "../ConfirmButton";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Pedidos · Painel DarkWear" } };

// Formata a data/hora no padrão brasileiro e no fuso de São Paulo (o servidor pode estar em outro fuso).
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// Texto legível de quem fez cada mudança de status (o banco guarda só o código curto).
const ORIGEM: Record<StatusOrigin, string> = { pedido: "cliente", painel: "painel", expiracao: "prazo", pagamento: "pagamento" };

// searchParams: os parâmetros do endereço. "status" é o filtro escolhido (?status=pago), "q" é a busca (?q=ana),
// "conferir" mostra só os pedidos com pagamento a conferir (?conferir=1) e "aviso" aparece quando uma mudança de
// status não foi aplicada (?aviso=mudou).
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; aviso?: string; q?: string | string[]; conferir?: string }>;
}) {
  await requireAdmin();
  const { status, aviso, q: qBruto, conferir } = await searchParams;
  // Só aceita um status que exista; qualquer outro valor no endereço vira "sem filtro".
  const filtro = ORDER_STATUS.find((s) => s === status);
  // A busca vem do endereço: só texto, no máximo 80 caracteres.
  const q = (Array.isArray(qBruto) ? qBruto[0] : qBruto)?.slice(0, 80) ?? "";
  const soConferir = conferir === "1";
  const encontrados = await listOrders(filtro, 100, q);
  const pedidos = soConferir ? encontrados.filter((o) => o.alerta) : encontrados;

  // Endereço de um filtro de status mantendo a busca que já estava feita.
  const hrefStatus = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    return `/admin/pedidos${p.size ? `?${p}` : ""}`;
  };

  // Estilo dos botões de filtro: o selecionado fica preenchido, os outros invertem ao passar o mouse.
  const chip = (on: boolean) =>
    `border-2 border-foreground px-4 py-2 text-base font-medium transition-colors ${
      on ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"
    }`;

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Operação"
        titulo="Pedidos"
        descricao="Acompanhe cada pedido, do pagamento à entrega."
        acoes={
          // Busca por GET: o termo vai para o endereço (?q=), então dá para compartilhar e voltar com o botão do navegador.
          <form action="/admin/pedidos" method="get" role="search" className="flex flex-wrap items-center gap-2">
            {filtro ? <input type="hidden" name="status" value={filtro} /> : null}
            <label htmlFor="busca-pedidos" className="sr-only">
              Buscar pedido
            </label>
            <input
              id="busca-pedidos"
              name="q"
              defaultValue={q}
              maxLength={80}
              placeholder="Nº do pedido, nome ou e-mail"
              className="w-72 max-w-full border-2 border-foreground bg-transparent px-4 py-2.5 text-base font-medium text-foreground outline-none placeholder:text-foreground/70 focus:bg-foreground focus:text-background focus:placeholder:text-background/70"
            />
            <button type="submit" className="border-2 border-foreground bg-foreground px-5 py-2.5 text-base font-bold text-background transition-colors hover:bg-transparent hover:text-foreground">
              Buscar
            </button>
            {q ? (
              <Link href={hrefStatus(filtro)} className="text-base font-medium underline underline-offset-4">
                Limpar
              </Link>
            ) : null}
          </form>
        }
      />

      {/* Aviso de conflito: aparece quando o dono tentou mudar um pedido que outra pessoa já mudou
          (ou a mudança não era permitida). Veja changeOrderStatusAction. */}
      {aviso === "mudou" ? (
        <p role="alert" className="border-2 border-foreground p-4 text-lg font-bold">
          Esse pedido já foi alterado por outra pessoa, ou a mudança não é permitida. A lista foi atualizada.
        </p>
      ) : null}

      {/* Filtro por status: cada botão é um link que muda o ?status= do endereço. */}
      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        <Link href={hrefStatus()} className={chip(!filtro && !soConferir)}>
          Todos
        </Link>
        {ORDER_STATUS.map((s) => (
          <Link key={s} href={hrefStatus(s)} className={`${chip(filtro === s && !soConferir)} capitalize`}>
            {s}
          </Link>
        ))}
        {/* Pedidos em que o cliente pagou e algo não bateu (cancelado ou valor diferente). */}
        <Link href="/admin/pedidos?conferir=1" className={chip(soConferir)}>
          Para conferir
        </Link>
      </nav>

      {pedidos.length === 0 ? (
        <p className="text-xl font-medium">
          {q
            ? `Nenhum pedido encontrado para "${q}".`
            : soConferir
              ? "Nenhum pagamento para conferir. Tudo certo."
              : filtro
                ? `Nenhum pedido com status "${filtro}".`
                : "Nenhum pedido ainda."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Um cartão por pedido: cabeçalho (número, data, status), itens e rodapé (total e botões). */}
          {pedidos.map((o) => (
            <article key={o.id} className="border-2 border-foreground">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground p-5">
                <div>
                  <h2 className="font-display text-4xl uppercase leading-none">{o.number}</h2>
                  <p className="mt-1 text-base font-medium">{dataHora.format(o.createdAt)}</p>
                  {/* Quem comprou. Pedido antigo (de antes do cadastro) não tem cliente. */}
                  {o.customer ? (
                    <p className="mt-2 text-base font-medium">
                      <span className="font-bold">{o.customer.name}</span> · {o.customer.email}
                      {clienteWhatsappLink(o.customer.phone) ? (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={clienteWhatsappLink(o.customer.phone, `Olá, ${o.customer.name.split(" ")[0]}! Sobre o seu pedido ${o.number} na DarkWear:`) ?? undefined}
                            className="font-bold underline underline-offset-4"
                          >
                            Chamar no WhatsApp
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-base font-medium">Pedido antigo (sem cadastro de cliente)</p>
                  )}
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

              {/* Alerta: pagamento aprovado que NÃO deixou o pedido pago. O cliente já pagou, então o dono
                  precisa agir (estornar no Mercado Pago ou reativar o pedido à mão). */}
              {o.alerta ? (
                <p role="alert" className="border-t-2 border-foreground bg-foreground px-5 py-3 text-base font-bold text-background">
                  {o.alerta === "cancelado"
                    ? "ATENÇÃO: o cliente pagou, mas este pedido está cancelado (as peças já voltaram ao estoque). Estorne o pagamento no Mercado Pago ou refaça o pedido."
                    : "ATENÇÃO: há um pagamento aprovado com valor diferente do total do pedido. Confira no Mercado Pago antes de enviar."}
                </p>
              ) : null}

              {/* Pagamentos online (Mercado Pago): forma, parcelas, valor e situação. Pedido fechado pelo
                  WhatsApp não tem esta linha. Tentativas "iniciado" (o cliente abriu a página de
                  pagamento e ainda não pagou) aparecem como "aguardando". */}
              {o.payments.length > 0 ? (
                <ul className="flex flex-col gap-1 border-t-2 border-foreground px-5 py-3 font-mono text-xs uppercase tracking-[0.1em]">
                  {o.payments.map((p, k) => (
                    <li key={k}>
                      Pagamento online · {p.status === "iniciado" ? "aguardando" : p.status}
                      {p.status !== "iniciado" ? ` · ${methodLabel(p.method)}` : ""}
                      {installmentsLabel(p.method, p.installments) ? ` · ${installmentsLabel(p.method, p.installments)}` : ""}
                      {p.amountCents != null ? ` · ${formatCents(p.amountCents)}` : ""}
                      {p.paidAt ? ` · pago em ${dataHora.format(p.paidAt)}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}

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
