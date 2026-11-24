// ============================================================================
// Tela DIÁRIO do painel: /admin/diario. A ideia: o LIVRO DE PONTO da loja.
//
// Cada linha é uma anotação de caderno de papel branco: a hora, quem fez (o administrador) e o que fez, com o
// item em fonte de máquina. As anotações são agrupadas por DIA, com a data em letras gigantes, e a coluna da hora
// fica alinhada como num livro de registro. Serve para responder "quem mexeu nisso?" quando há mais de uma pessoa
// no painel. O diário só cresce: não há botão para apagar nem editar nada aqui.
//
// De onde vêm os dados: listarAuditoria (src/server/admin/audit.ts).
// ============================================================================

import type { Metadata } from "next";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { fraseDaAcao, nomeCurtoDoAtor } from "@/lib/audit-labels";
import { requireAdmin } from "@/server/admin/auth";
import { listarAuditoria, type EntradaDoDiario } from "@/server/admin/audit";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Diário · Painel DarkWear" } };

const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
// Chave do dia no fuso de São Paulo (AAAA-MM-DD), para agrupar certo mesmo se o servidor estiver em outro fuso.
const chaveDoDia = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);

export default async function DiarioPage() {
  await requireAdmin();
  const entradas = await listarAuditoria(300);

  // Agrupa por dia, mantendo a ordem (da mais nova para a mais antiga).
  const dias: { chave: string; titulo: string; linhas: EntradaDoDiario[] }[] = [];
  for (const e of entradas) {
    const chave = chaveDoDia(e.em);
    const atual = dias.at(-1);
    if (atual && atual.chave === chave) atual.linhas.push(e);
    else dias.push({ chave, titulo: dia.format(e.em), linhas: [e] });
  }

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Registro"
        titulo="Diário"
        descricao="Quem mexeu em quê, e quando. Cada ação do painel fica anotada aqui e não pode ser apagada."
      />

      {dias.length === 0 ? (
        <p className="text-xl font-medium">Nada anotado ainda. As próximas ações do painel aparecem aqui.</p>
      ) : (
        <div className="flex flex-col gap-12">
          {dias.map((d) => (
            <section key={d.chave} aria-label={d.titulo}>
              <h2 className="border-b-2 border-foreground pb-2 font-display text-[clamp(2.5rem,7vw,5rem)] uppercase leading-none">{d.titulo}</h2>
              {/* O papel do caderno: branco, com a hora numa coluna fixa à esquerda. */}
              <ol className="bg-foreground font-mono text-background">
                {d.linhas.map((e) => (
                  <li key={e.id} className="flex gap-4 border-b-2 border-dashed border-background px-4 py-3 last:border-b-0">
                    <time dateTime={e.em.toISOString()} className="w-14 shrink-0 text-lg font-bold">
                      {hora.format(e.em)}
                    </time>
                    <p className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">
                      <strong className="font-bold" title={e.ator}>
                        {nomeCurtoDoAtor(e.ator)}
                      </strong>{" "}
                      {fraseDaAcao(e.acao)}
                      {e.alvo ? <strong className="font-bold"> {e.alvo}</strong> : null}
                      {e.detalhe ? <span> · {e.detalhe}</span> : null}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
