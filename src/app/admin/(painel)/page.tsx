// ============================================================================
// Tela inicial do painel: /admin ("Painel").
//
// É a primeira coisa que o dono vê depois do login. Responde "o que precisa da minha atenção?":
//   - quatro blocos com contadores (pedidos pendentes, pagos a enviar, enviados, encomendas novas),
//     cada um levando direto à lista filtrada;
//   - peças com estoque baixo;
//   - os 5 pedidos mais recentes.
// Os números vêm de dashboardStats (src/server/admin/dashboard.ts).
// ============================================================================

import Link from "next/link";
import { dashboardStats } from "@/server/admin/dashboard";
import { formatCents } from "@/lib/money";
import { requireAdmin } from "@/server/admin/auth";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Painel · DarkWear" } };

export default async function PainelPage() {
  // Confere a sessão também aqui (e não só no layout): cada página se protege sozinha.
  await requireAdmin();
  const s = await dashboardStats();

  // Os quatro blocos de contador. "href" leva à lista já filtrada por aquele status.
  const blocos = [
    { rotulo: "Pedidos pendentes", valor: s.pendentes, href: "/admin/pedidos?status=pendente" },
    { rotulo: "Pagos, a enviar", valor: s.pagos, href: "/admin/pedidos?status=pago" },
    { rotulo: "Enviados", valor: s.enviados, href: "/admin/pedidos?status=enviado" },
    { rotulo: "Encomendas novas", valor: s.novasEncomendas, href: "/admin/encomendas" },
  ];

  return (
    <div className="flex flex-col gap-14">
      <h1 className="font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Painel</h1>

      {/* Contadores: uma grade de blocos clicáveis que invertem de cor ao passar o mouse. */}
      <section aria-label="Resumo" className="grid border-l-2 border-t-2 border-foreground sm:grid-cols-2 lg:grid-cols-4">
        {blocos.map((b) => (
          <Link
            key={b.rotulo}
            href={b.href}
            className="flex flex-col gap-3 border-b-2 border-r-2 border-foreground p-6 transition-colors hover:bg-foreground hover:text-background"
          >
            <span className="font-display text-7xl leading-none">{b.valor}</span>
            <span className="text-lg font-medium">{b.rotulo}</span>
          </Link>
        ))}
      </section>

      <section className="grid gap-12 lg:grid-cols-2">
        {/* Coluna da esquerda: peças acabando (3 unidades ou menos). Cada nome leva à edição da peça. */}
        <div>
          <h2 className="mb-4 font-display text-4xl uppercase">Estoque baixo</h2>
          {s.lowStock.length === 0 ? (
            <p className="text-lg font-medium">Nenhum produto com 3 peças ou menos.</p>
          ) : (
            <ul className="border-b-2 border-foreground">
              {s.lowStock.map((p) => (
                <li key={p.slug} className="flex items-center justify-between border-t-2 border-foreground py-3 text-lg font-medium">
                  <Link href={`/admin/produtos/${p.slug}`} className="underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <span className="font-bold">{p.stock === 0 ? "Esgotado" : `${p.stock} un.`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Coluna da direita: os pedidos mais recentes (número, status e total). */}
        <div>
          <h2 className="mb-4 font-display text-4xl uppercase">Últimos pedidos</h2>
          {s.latest.length === 0 ? (
            <p className="text-lg font-medium">Nenhum pedido ainda.</p>
          ) : (
            <ul className="border-b-2 border-foreground">
              {s.latest.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 border-t-2 border-foreground py-3 text-lg font-medium">
                  <Link href="/admin/pedidos" className="underline-offset-4 hover:underline">
                    {o.number}
                  </Link>
                  <span className="font-mono text-sm uppercase">{o.status}</span>
                  <span className="font-bold">{formatCents(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
