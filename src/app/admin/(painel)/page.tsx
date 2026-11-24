// ============================================================================
// Tela inicial do painel: /admin (o "Painel").
//
// A pergunta que ela responde: "o que precisa da minha atenção agora?". De cima para baixo:
//   1. um ALERTA, se algum cliente pagou e o pedido não ficou pago (dinheiro de cliente parado);
//   2. o dinheiro e o ritmo: faturamento do mês, pedidos de hoje e clientes;
//   3. a fila de trabalho: pedidos pendentes, pagos a enviar, enviados e encomendas novas (cada bloco leva à lista);
//   4. as peças acabando e os últimos pedidos, com o nome de quem comprou.
//
// De onde vêm os números: dashboardStats (src/server/admin/dashboard.ts).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { formatCents } from "@/lib/money";
import { requireAdmin } from "@/server/admin/auth";
import { dashboardStats } from "@/server/admin/dashboard";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Painel · DarkWear" } };

// A data de hoje por extenso, no fuso de São Paulo (o servidor pode estar em outro).
const hojePorExtenso = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" });

export default async function PainelPage() {
  // Confere a sessão também aqui (e não só no layout): cada página se protege sozinha.
  const admin = await requireAdmin();
  const s = await dashboardStats();
  const primeiroNome = admin.name.split(" ")[0];

  // Os quatro contadores da fila de trabalho. "href" leva à lista já filtrada por aquele status.
  const fila = [
    { rotulo: "Pedidos pendentes", valor: s.pendentes, href: "/admin/pedidos?status=pendente", dica: "esperando pagamento" },
    { rotulo: "Pagos, a enviar", valor: s.pagos, href: "/admin/pedidos?status=pago", dica: "prontos para sair" },
    { rotulo: "Enviados", valor: s.enviados, href: "/admin/pedidos?status=enviado", dica: "a caminho" },
    { rotulo: "Encomendas novas", valor: s.novasEncomendas, href: "/admin/encomendas", dica: "sem atendimento" },
  ];

  return (
    <div className="flex flex-col gap-12">
      <CabecalhoDePagina sobretitulo={hojePorExtenso.format(new Date())} titulo={`Olá, ${primeiroNome}`} descricao="O que precisa da sua atenção agora." />

      {/* 1) Alerta: cliente que pagou e o pedido não ficou pago. Bloco invertido (branco) para saltar aos olhos. */}
      {s.pagamentosParaConferir > 0 && (
        <Link
          href="/admin/pedidos?conferir=1"
          className="flex flex-wrap items-center justify-between gap-4 bg-foreground p-6 text-background transition-opacity hover:opacity-90"
        >
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Atenção</p>
            <p className="mt-1 font-display text-4xl uppercase leading-none">
              {s.pagamentosParaConferir} {s.pagamentosParaConferir === 1 ? "pagamento" : "pagamentos"} para conferir
            </p>
            <p className="mt-2 text-lg font-medium">O cliente pagou, mas o pedido não ficou como pago (cancelado ou com valor diferente).</p>
          </div>
          <span className="text-xl font-bold">Ver pedidos →</span>
        </Link>
      )}

      {/* 2) O dinheiro e o ritmo. O faturamento ocupa duas colunas porque é o número mais importante. */}
      <section aria-label="Resumo do mês" className="grid border-l-2 border-t-2 border-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 border-b-2 border-r-2 border-foreground p-6 sm:col-span-2">
          <span className="font-display text-[clamp(3.5rem,7vw,5.5rem)] leading-none">{formatCents(s.faturamentoMesCents)}</span>
          <span className="text-lg font-medium">Faturamento do mês (pedidos pagos, enviados e entregues)</span>
        </div>
        <div className="flex flex-col gap-3 border-b-2 border-r-2 border-foreground p-6">
          <span className="font-display text-7xl leading-none">{s.pedidosHoje}</span>
          <span className="text-lg font-medium">{s.pedidosHoje === 1 ? "Pedido hoje" : "Pedidos hoje"}</span>
        </div>
        <Link href="/admin/clientes" className="flex flex-col gap-3 border-b-2 border-r-2 border-foreground p-6 transition-colors hover:bg-foreground hover:text-background">
          <span className="font-display text-7xl leading-none">{s.totalClientes}</span>
          <span className="text-lg font-medium">{s.totalClientes === 1 ? "Cliente cadastrado" : "Clientes cadastrados"}</span>
        </Link>
      </section>

      {/* 3) A fila de trabalho: blocos clicáveis que invertem de cor ao passar o mouse. */}
      <section aria-label="Fila de trabalho" className="grid border-l-2 border-t-2 border-foreground sm:grid-cols-2 lg:grid-cols-4">
        {fila.map((b) => (
          <Link
            key={b.rotulo}
            href={b.href}
            className="flex flex-col gap-2 border-b-2 border-r-2 border-foreground p-6 transition-colors hover:bg-foreground hover:text-background"
          >
            <span className="font-display text-7xl leading-none">{b.valor}</span>
            <span className="text-lg font-bold">{b.rotulo}</span>
            <span className="font-mono text-xs uppercase tracking-[0.12em]">{b.dica}</span>
          </Link>
        ))}
      </section>

      <section className="grid gap-12 lg:grid-cols-2">
        {/* Peças acabando (3 unidades ou menos). Cada nome leva à edição da peça. */}
        <div>
          <h2 className="mb-4 font-display text-4xl uppercase">Estoque baixo</h2>
          {s.lowStock.length === 0 ? (
            <p className="text-lg font-medium">Nenhum produto com 3 peças ou menos.</p>
          ) : (
            <ul className="border-b-2 border-foreground">
              {s.lowStock.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-4 border-t-2 border-foreground py-3 text-lg font-medium">
                  <Link href={`/admin/produtos/${p.slug}`} className="underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <span className="font-bold">{p.stock === 0 ? "Esgotado" : `${p.stock} un.`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Os pedidos mais recentes: número, quem comprou, situação e total. */}
        <div>
          <h2 className="mb-4 font-display text-4xl uppercase">Últimos pedidos</h2>
          {s.latest.length === 0 ? (
            <p className="text-lg font-medium">Nenhum pedido ainda.</p>
          ) : (
            <ul className="border-b-2 border-foreground">
              {s.latest.map((o) => (
                <li key={o.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-t-2 border-foreground py-3 text-lg font-medium">
                  <Link href={`/admin/pedidos?q=${o.number}`} className="font-mono font-bold underline-offset-4 hover:underline">
                    {o.number}
                  </Link>
                  <span className="truncate">{o.customer?.name ?? "Cliente antigo"}</span>
                  <span className="text-right">
                    <span className="block font-bold">{formatCents(o.totalCents)}</span>
                    <span className="block font-mono text-xs uppercase">{o.status}</span>
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
