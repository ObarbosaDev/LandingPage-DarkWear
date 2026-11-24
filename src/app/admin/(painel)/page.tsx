// ============================================================================
// Tela inicial do painel: /admin. A ideia: o FECHAMENTO DE CAIXA e o QUADRO DE AVISOS do fim do balcão.
//
//   - À esquerda, o recibo do mês (o mesmo papel de máquina da sacola do cliente, do outro lado do balcão):
//     pedidos pagos, ticket médio, pedidos de hoje, clientes, e o faturamento em letras grandes;
//   - À direita, o quadro de avisos: o que precisa de uma decisão agora (pagamento a conferir, pedidos esperando,
//     pagos a enviar, encomendas novas), cada aviso um bloco clicável que leva direto ao trabalho;
//   - Embaixo, as peças acabando (com a pilha de estoque) e os últimos pedidos.
//
// A pergunta que a tela responde: "o que precisa da minha atenção agora?". De onde vêm os números: dashboardStats
// (src/server/admin/dashboard.ts).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { Recibo } from "@/components/admin/Recibo";
import { saudacao } from "@/lib/greeting";
import { formatCents } from "@/lib/money";
import { tempoRelativo } from "@/lib/relative-time";
import { medidorDeEstoque } from "@/lib/stock-meter";
import { requireAdmin } from "@/server/admin/auth";
import { dashboardStats } from "@/server/admin/dashboard";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Painel · DarkWear" } };

// A data de hoje por extenso e o mês do fechamento, no fuso de São Paulo (o servidor pode estar em outro).
const hojePorExtenso = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" });
const mesDoFechamento = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Um aviso do quadro: bloco clicável com o número grande. "urgente" inverte as cores (branco com texto preto). */
function Aviso({ href, valor, rotulo, dica, urgente = false }: { href: string; valor: number; rotulo: string; dica: string; urgente?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-2 border-2 border-foreground p-5 transition-colors ${
        urgente ? "bg-foreground text-background hover:bg-background hover:text-foreground" : "hover:bg-foreground hover:text-background"
      }`}
    >
      <span className="font-display text-7xl leading-none">{valor}</span>
      <span className="text-lg font-bold">{rotulo}</span>
      <span className="font-mono text-xs font-bold uppercase tracking-[0.12em]">{dica}</span>
    </Link>
  );
}

export default async function PainelPage() {
  // Confere a sessão também aqui (e não só no layout): cada página se protege sozinha.
  const admin = await requireAdmin();
  const s = await dashboardStats();
  const agora = new Date();
  const primeiroNome = admin.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-14">
      <CabecalhoDePagina sobretitulo={hojePorExtenso.format(agora)} titulo={`${saudacao(agora)}, ${primeiroNome}`} descricao="Aqui está o seu dia na DarkWear: o caixa do mês e o que espera por você." />

      <section className="grid gap-12 lg:grid-cols-[24rem_1fr] lg:items-start">
        {/* À esquerda, o fechamento do mês: o recibo. */}
        <Recibo
          cabecalho="DarkWear"
          periodo={mesDoFechamento.format(agora)}
          linhas={[
            { rotulo: "Pedidos pagos", valor: s.pedidosPagosMes },
            { rotulo: "Ticket médio", valor: formatCents(s.ticketMedioCents) },
            { rotulo: "Pedidos hoje", valor: s.pedidosHoje },
            { rotulo: "Clientes", valor: s.totalClientes },
          ]}
          totalRotulo="Faturamento do mês"
          total={formatCents(s.faturamentoMesCents)}
          rodape="Conta só pedidos pagos, enviados e entregues."
        />

        {/* À direita, o quadro de avisos: o que precisa de uma decisão. */}
        <div>
          <h2 className="font-display text-5xl uppercase leading-none">Quadro de avisos</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {s.pagamentosParaConferir > 0 && (
              <div className="sm:col-span-2">
                <Aviso
                  href="/admin/pedidos?conferir=1"
                  valor={s.pagamentosParaConferir}
                  rotulo={s.pagamentosParaConferir === 1 ? "Pagamento para conferir" : "Pagamentos para conferir"}
                  dica="o cliente pagou e o pedido não ficou pago"
                  urgente
                />
              </div>
            )}
            <Aviso href="/admin/pedidos?status=pendente" valor={s.pendentes} rotulo="Esperando pagamento" dica="pedidos pendentes" />
            <Aviso href="/admin/pedidos?status=pago" valor={s.pagos} rotulo="Pagos, a enviar" dica="prontos para sair" />
            <Aviso href="/admin/pedidos?status=enviado" valor={s.enviados} rotulo="A caminho" dica="pedidos enviados" />
            <Aviso href="/admin/encomendas" valor={s.novasEncomendas} rotulo="Encomendas novas" dica="sem atendimento" />
          </div>
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-2">
        {/* Peças acabando (3 unidades ou menos), cada uma com a sua pilha de estoque. */}
        <div>
          <h2 className="mb-4 font-display text-5xl uppercase leading-none">Acabando</h2>
          {s.lowStock.length === 0 ? (
            <p className="text-lg font-medium">Nenhuma peça com 3 unidades ou menos.</p>
          ) : (
            <ul className="border-b-2 border-foreground">
              {s.lowStock.map((p) => {
                const m = medidorDeEstoque(p.stock);
                return (
                  <li key={p.slug} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t-2 border-foreground py-4 text-lg font-medium">
                    <Link href={`/admin/produtos/${p.slug}`} className="font-bold underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                    <span className="flex items-center gap-3">
                      {/* A pilha: 10 quadradinhos, um por peça. */}
                      <span className="flex gap-0.5" aria-hidden="true">
                        {Array.from({ length: m.total }, (_, i) => (
                          <span key={i} className={`block h-4 w-2 border border-foreground ${i < m.cheios ? "bg-foreground" : ""}`} />
                        ))}
                      </span>
                      <span className="font-bold">{p.stock === 0 ? "Esgotado" : `${p.stock} un.`}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Os pedidos mais recentes: número, quem comprou, há quanto tempo, situação e total. */}
        <div>
          <h2 className="mb-4 font-display text-5xl uppercase leading-none">Últimos pedidos</h2>
          {s.latest.length === 0 ? (
            <p className="text-lg font-medium">Nenhum pedido ainda.</p>
          ) : (
            <ul className="border-b-2 border-foreground">
              {s.latest.map((o) => (
                <li key={o.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-t-2 border-foreground py-4 text-lg font-medium">
                  <Link href={`/admin/pedidos?q=${o.number}`} className="font-mono font-bold underline-offset-4 hover:underline">
                    {o.number}
                  </Link>
                  <span className="min-w-0">
                    <span className="block truncate">{o.customer?.name ?? "Cliente antigo"}</span>
                    <span className="block font-mono text-xs font-bold uppercase tracking-[0.1em]">{tempoRelativo(o.createdAt)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold">{formatCents(o.totalCents)}</span>
                    <span className="block font-mono text-xs font-bold uppercase">{o.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
