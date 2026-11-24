// ============================================================================
// Tela de pedidos do painel: /admin/pedidos. A ideia: a ESTEIRA.
//
// Os pedidos de peças prontas andam por quatro colunas, como numa linha de produção: PENDENTE → PAGO → ENVIADO →
// ENTREGUE. Cada pedido é uma ordem de serviço de papel branco (ver Ordem.tsx) com o botão do passo seguinte no
// próprio cartão: um clique e o pedido avança. Cada coluna mostra a quantidade e o valor que está nela. Os
// cancelados ficam recolhidos embaixo.
//
// Dá para BUSCAR por número do pedido ou por nome/e-mail do cliente, ver só os "para conferir" (cliente que pagou
// e o pedido não ficou pago) ou abrir uma coluna só (?status=pago). Cancelar devolve as peças ao estoque.
//
// De onde vêm os dados: listOrders (src/server/admin/orders.ts). Os botões chamam changeOrderStatusAction.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { formatCents } from "@/lib/money";
import { requireAdmin } from "@/server/admin/auth";
import { listOrders } from "@/server/admin/orders";
import { ORDER_STATUS, type OrderStatus } from "@/server/db/schema";
import { Ordem } from "./Ordem";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Esteira · Painel DarkWear" } };

// As colunas da esteira, na ordem do fluxo, e o texto de quando estão vazias.
const COLUNAS: { status: OrderStatus; titulo: string; vazio: string }[] = [
  { status: "pendente", titulo: "Pendente", vazio: "Ninguém esperando para pagar." },
  { status: "pago", titulo: "Pago", vazio: "Nada pago para enviar." },
  { status: "enviado", titulo: "Enviado", vazio: "Nada a caminho." },
  { status: "entregue", titulo: "Entregue", vazio: "Nada entregue ainda." },
];

// searchParams: os parâmetros do endereço. "status" abre uma coluna só (?status=pago), "q" é a busca (?q=ana),
// "conferir" mostra só os pedidos com pagamento a conferir (?conferir=1) e "aviso" aparece quando uma mudança de
// status não foi aplicada (?aviso=mudou).
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; aviso?: string; q?: string | string[]; conferir?: string }>;
}) {
  await requireAdmin();
  const { status, aviso, q: qBruto, conferir } = await searchParams;
  // Só aceita um status que exista; qualquer outro valor no endereço vira "todas as colunas".
  const filtro = ORDER_STATUS.find((s) => s === status);
  // A busca vem do endereço: só texto, no máximo 80 caracteres.
  const q = (Array.isArray(qBruto) ? qBruto[0] : qBruto)?.slice(0, 80) ?? "";
  const soConferir = conferir === "1";

  const encontrados = await listOrders(undefined, 200, q);
  const pedidos = soConferir ? encontrados.filter((o) => o.alerta) : encontrados;
  const cancelados = pedidos.filter((o) => o.status === "cancelado");
  // Uma coluna só quando o filtro pede; senão, as quatro.
  const colunas = filtro && filtro !== "cancelado" ? COLUNAS.filter((c) => c.status === filtro) : COLUNAS;
  const mostrarCancelados = !filtro || filtro === "cancelado";

  // Chip de filtro: o selecionado fica preenchido; os outros invertem ao passar o mouse.
  const chip = (on: boolean) =>
    `border-2 border-foreground px-4 py-2 text-base font-medium transition-colors ${on ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"}`;

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Operação"
        titulo="Esteira"
        descricao="Cada pedido anda da esquerda para a direita: do pagamento até a entrega."
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
              <Link href="/admin/pedidos" className="text-base font-medium underline underline-offset-4">
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
          Esse pedido já foi alterado por outra pessoa, ou a mudança não é permitida. A esteira foi atualizada.
        </p>
      ) : null}

      {/* Filtros rápidos: todas as colunas, uma coluna só, ou só os pagamentos a conferir. */}
      <nav aria-label="Filtrar a esteira" className="flex flex-wrap gap-2">
        <Link href="/admin/pedidos" className={chip(!filtro && !soConferir)}>
          Esteira inteira
        </Link>
        {COLUNAS.map((c) => (
          <Link key={c.status} href={`/admin/pedidos?status=${c.status}`} className={chip(filtro === c.status && !soConferir)}>
            {c.titulo}
          </Link>
        ))}
        <Link href="/admin/pedidos?conferir=1" className={chip(soConferir)}>
          Para conferir
        </Link>
      </nav>

      {pedidos.length === 0 ? (
        <p className="text-xl font-medium">
          {q ? `Nenhum pedido encontrado para "${q}".` : soConferir ? "Nenhum pagamento para conferir. Tudo certo." : "Nenhum pedido ainda."}
        </p>
      ) : (
        <>
          {/* A esteira: uma coluna por etapa, com a quantidade e o valor que está nela. */}
          <div className={`grid gap-x-8 gap-y-12 ${colunas.length > 1 ? "md:grid-cols-2 xl:grid-cols-4" : "max-w-xl"}`}>
            {colunas.map((c, i) => {
              const daColuna = pedidos.filter((o) => o.status === c.status);
              const soma = daColuna.reduce((n, o) => n + o.totalCents, 0);
              return (
                <section key={c.status} id={c.status} aria-label={c.titulo} className="min-w-0">
                  <header className="border-b-2 border-foreground pb-3">
                    <p className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.18em]">
                      <span>Etapa {String(i + 1).padStart(2, "0")}</span>
                      {/* A seta da esteira: indica o sentido em que os pedidos andam. */}
                      {colunas.length > 1 && i < colunas.length - 1 ? <span aria-hidden="true">→</span> : null}
                    </p>
                    <h2 className="mt-1 font-display text-6xl uppercase leading-[0.9]">{c.titulo}</h2>
                    <p className="mt-2 font-mono text-sm font-bold">
                      {daColuna.length} {daColuna.length === 1 ? "pedido" : "pedidos"} · {formatCents(soma)}
                    </p>
                  </header>
                  <div className="mt-5 flex flex-col gap-5">
                    {daColuna.length === 0 ? <p className="font-mono text-sm font-bold uppercase tracking-[0.08em]">{c.vazio}</p> : daColuna.map((o) => <Ordem key={o.id} o={o} />)}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Os cancelados ficam recolhidos: não são trabalho, só registro. */}
          {mostrarCancelados && cancelados.length > 0 && (
            <details open={filtro === "cancelado" || soConferir || Boolean(q)} className="border-t-2 border-foreground pt-6">
              <summary className="cursor-pointer font-display text-4xl uppercase leading-none underline-offset-8 hover:underline">
                Cancelados ({cancelados.length})
              </summary>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {cancelados.map((o) => (
                  <Ordem key={o.id} o={o} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
