// ============================================================================
// Tela de encomendas do painel: /admin/encomendas.
//
// O que o dono faz aqui: ver as encomendas de camiseta com a arte do cliente (feitas em /personalizar)
// e marcar o andamento (novo, em contato, produzindo, concluído, cancelado).
// A arte em si chega pelo WhatsApp: aqui fica só o REGISTRO do pedido (modelo, cor, tamanho, posição).
//
// De onde vêm os dados: listCustomOrders (src/server/admin/custom-orders.ts). O botão "Salvar"
// chama changeCustomStatusAction (src/app/admin/actions.ts).
// ============================================================================

import type { Metadata } from "next";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { requireAdmin } from "@/server/admin/auth";
import { CUSTOM_STATUS, listCustomOrders } from "@/server/admin/custom-orders";
import { changeCustomStatusAction } from "@/app/admin/actions";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Encomendas · Painel DarkWear" } };

// Data/hora no padrão brasileiro e fuso de São Paulo.
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
// O banco guarda o código curto da posição; aqui ele vira o texto legível mostrado ao dono.
const POSICAO: Record<string, string> = { peito: "Peito esquerdo", frente: "Frente centro", costas: "Costas", manga: "Manga" };

export default async function EncomendasPage() {
  await requireAdmin();
  const lista = await listCustomOrders();

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Operação"
        titulo="Encomendas"
        descricao="Pedidos de camiseta com arte do cliente. O arquivo da arte chega pelo WhatsApp, aqui fica o registro do pedido."
      />

      {lista.length === 0 ? (
        <p className="text-xl font-medium">Nenhuma encomenda ainda.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Um cartão por encomenda: cabeçalho (número, data, status), detalhes e o seletor de andamento. */}
          {lista.map((c) => (
            <article key={c.id} className="border-2 border-foreground">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground p-5">
                <div>
                  {/* Número da encomenda: EP- (de "encomenda personalizada") + id com 5 dígitos. */}
                  <h2 className="font-display text-4xl uppercase leading-none">
                    EP-{String(c.id).padStart(5, "0")}
                  </h2>
                  <p className="mt-1 text-base font-medium">{dataHora.format(c.createdAt)}</p>
                </div>
                <span className="border-2 border-foreground px-3 py-1 font-mono text-sm uppercase">{c.status}</span>
              </header>

              {/* Lista de detalhes (dl/dt/dd = "termo e descrição"). Nome, arquivo e observações só
                  aparecem se o cliente os preencheu. */}
              <dl className="grid gap-x-8 gap-y-2 p-5 text-lg font-medium sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-sm uppercase tracking-[0.15em]">Modelo</dt>
                  <dd>{c.model} · {c.color} · tamanho {c.size}</dd>
                </div>
                <div>
                  <dt className="font-mono text-sm uppercase tracking-[0.15em]">Posição da arte</dt>
                  <dd>{POSICAO[c.placement] ?? c.placement}</dd>
                </div>
                {c.name ? (
                  <div>
                    <dt className="font-mono text-sm uppercase tracking-[0.15em]">Nome</dt>
                    <dd>{c.name}</dd>
                  </div>
                ) : null}
                {c.fileName ? (
                  <div>
                    <dt className="font-mono text-sm uppercase tracking-[0.15em]">Arquivo informado</dt>
                    <dd>{c.fileName}</dd>
                  </div>
                ) : null}
                {c.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="font-mono text-sm uppercase tracking-[0.15em]">Detalhes</dt>
                    <dd>{c.notes}</dd>
                  </div>
                ) : null}
              </dl>

              {/* Mudar o andamento: escolhe o status e clica em "Salvar". O campo escondido leva o id. */}
              <form action={changeCustomStatusAction} className="flex flex-wrap items-center gap-3 border-t-2 border-foreground p-5">
                <input type="hidden" name="id" value={c.id} />
                <label htmlFor={`status-${c.id}`} className="font-mono text-sm uppercase tracking-[0.15em]">
                  Status
                </label>
                {/* defaultValue começa no status atual; o dono pode escolher qualquer outro. */}
                <select
                  id={`status-${c.id}`}
                  name="status"
                  defaultValue={c.status}
                  className="border-2 border-foreground bg-background px-3 py-2 text-lg font-medium"
                >
                  {CUSTOM_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="border-2 border-foreground bg-foreground px-5 py-2 text-base font-bold text-background transition-colors hover:bg-transparent hover:text-foreground"
                >
                  Salvar
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
