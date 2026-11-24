// ============================================================================
// Tela de encomendas do painel: /admin/encomendas. A ideia: a FILA DE ARTE.
//
// Cada encomenda (camiseta com a arte do cliente, feita em /personalizar) é uma FICHA DE ESTAMPA de papel branco,
// como a que acompanha a peça na produção: número, há quanto tempo chegou, o que foi pedido e um MAPA DA ARTE (quatro
// blocos: peito, frente, costas e manga) com o lugar escolhido preenchido de preto. Não é desenho de camiseta: é o
// mesmo sistema de blocos da marca.
//
// O andamento muda com UM clique: os cinco estados (novo, em contato, produzindo, concluído, cancelado) são botões
// na própria ficha, e o atual fica preenchido. Ao contrário do pedido de peça pronta, o fluxo não é linear (o
// atendimento por WhatsApp vai e volta), então qualquer estado pode ser escolhido a qualquer momento.
// As fichas em andamento aparecem primeiro; as encerradas (concluídas e canceladas) ficam recolhidas embaixo.
//
// A arte em si chega pelo WhatsApp: aqui fica só o REGISTRO do pedido. Dados: listCustomOrders
// (src/server/admin/custom-orders.ts). Os botões chamam changeCustomStatusAction (src/app/admin/actions.ts).
// ============================================================================

import type { Metadata } from "next";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { tempoRelativo } from "@/lib/relative-time";
import { requireAdmin } from "@/server/admin/auth";
import { CUSTOM_STATUS, listCustomOrders } from "@/server/admin/custom-orders";
import { changeCustomStatusAction } from "@/app/admin/actions";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Fila de arte · Painel DarkWear" } };

// Data/hora no padrão brasileiro e fuso de São Paulo.
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// As posições da arte, na ordem do mapa (2 × 2). O banco guarda o código curto; aqui vira o rótulo do bloco.
const POSICOES: { id: string; rotulo: string }[] = [
  { id: "peito", rotulo: "Peito" },
  { id: "frente", rotulo: "Frente" },
  { id: "costas", rotulo: "Costas" },
  { id: "manga", rotulo: "Manga" },
];

// Os estados que contam como "em andamento"; os outros dois ficam recolhidos embaixo.
const EM_ANDAMENTO: readonly string[] = ["novo", "em contato", "produzindo"];

type Encomenda = Awaited<ReturnType<typeof listCustomOrders>>[number];

/** A ficha de uma encomenda: papel branco com o mapa da arte, os dados e os botões de andamento. */
function Ficha({ c }: { c: Encomenda }) {
  return (
    <article className="bg-foreground text-background">
      <div className="p-5 font-mono">
        {/* Topo: número da encomenda (EP- de "encomenda personalizada") e há quanto tempo chegou. */}
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-background pb-3">
          <h3 className="text-xl font-bold">EP-{String(c.id).padStart(5, "0")}</h3>
          <span className="text-xs font-bold uppercase tracking-[0.1em]" title={dataHora.format(c.createdAt)}>
            {tempoRelativo(c.createdAt)}
          </span>
        </div>

        <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
          {/* O mapa da arte: quatro blocos, o escolhido fica preto. Não é desenho de camiseta, é o sistema de blocos. */}
          <div className="grid w-40 grid-cols-2 gap-1" role="img" aria-label={`Posição da arte: ${POSICOES.find((p) => p.id === c.placement)?.rotulo ?? c.placement}`}>
            {POSICOES.map((p) => {
              const escolhido = p.id === c.placement;
              return (
                <span
                  key={p.id}
                  className={`flex aspect-square items-end border-2 border-background p-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${escolhido ? "bg-background text-foreground" : ""}`}
                >
                  {p.rotulo}
                </span>
              );
            })}
          </div>

          <dl className="flex flex-col gap-2 text-sm font-bold">
            <div>
              <dt className="text-xs uppercase tracking-[0.15em]">Pedido</dt>
              <dd className="font-display text-3xl uppercase leading-none">{c.model}</dd>
              <dd>
                {c.color} · tamanho {c.size}
              </dd>
            </div>
            {c.name ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.15em]">Nome</dt>
                <dd>{c.name}</dd>
              </div>
            ) : null}
            {c.fileName ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.15em]">Arquivo informado</dt>
                <dd className="break-all">{c.fileName}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {c.notes ? (
          <p className="mt-4 border-t-2 border-dashed border-background pt-3 text-sm font-bold">
            <span className="mb-1 block text-xs uppercase tracking-[0.15em]">Detalhes</span>
            {c.notes}
          </p>
        ) : null}

        {/* O andamento: um botão por estado; o atual fica preenchido. O campo escondido leva o id da encomenda. */}
        <form action={changeCustomStatusAction} className="mt-5 border-t-2 border-dashed border-background pt-4">
          <input type="hidden" name="id" value={c.id} />
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em]">Andamento</p>
          <div className="flex flex-wrap gap-2">
            {CUSTOM_STATUS.map((s) => {
              const atual = s === c.status;
              return (
                <button
                  key={s}
                  type="submit"
                  name="status"
                  value={s}
                  aria-pressed={atual}
                  className={`border-2 border-background px-3 py-2 text-sm font-bold uppercase transition-colors ${
                    atual ? "bg-background text-foreground" : "hover:bg-background hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </form>
      </div>
    </article>
  );
}

export default async function EncomendasPage() {
  await requireAdmin();
  const lista = await listCustomOrders();
  const emAndamento = lista.filter((c) => EM_ANDAMENTO.includes(c.status));
  const encerradas = lista.filter((c) => !EM_ANDAMENTO.includes(c.status));

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Operação"
        titulo="Fila de arte"
        descricao="Camisetas com a arte do cliente. O arquivo da arte chega pelo WhatsApp: aqui fica a ficha de cada pedido."
      />

      {lista.length === 0 ? (
        <p className="text-xl font-medium">Nenhuma encomenda ainda.</p>
      ) : (
        <>
          <section aria-label="Em andamento">
            <h2 className="font-display text-5xl uppercase leading-none">
              Em andamento <span className="font-mono text-xl">({emAndamento.length})</span>
            </h2>
            {emAndamento.length === 0 ? (
              <p className="mt-4 text-lg font-medium">Nada na fila agora.</p>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                {emAndamento.map((c) => (
                  <Ficha key={c.id} c={c} />
                ))}
              </div>
            )}
          </section>

          {/* As concluídas e canceladas ficam recolhidas: já não são trabalho, só registro. */}
          {encerradas.length > 0 && (
            <details className="border-t-2 border-foreground pt-6">
              <summary className="cursor-pointer font-display text-4xl uppercase leading-none underline-offset-8 hover:underline">
                Encerradas ({encerradas.length})
              </summary>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                {encerradas.map((c) => (
                  <Ficha key={c.id} c={c} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
