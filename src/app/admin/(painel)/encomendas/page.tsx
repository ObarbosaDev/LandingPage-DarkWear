import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { CUSTOM_STATUS, listCustomOrders } from "@/lib/admin-data";
import { changeCustomStatusAction } from "@/app/admin/actions";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: "Encomendas" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const POSICAO: Record<string, string> = { peito: "Peito esquerdo", frente: "Frente centro", costas: "Costas", manga: "Manga" };

export default async function EncomendasPage() {
  await requireAdmin();
  const lista = await listCustomOrders();

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.9]">Encomendas</h1>
      <p className="max-w-2xl text-xl font-medium">
        Pedidos de camiseta com arte do cliente. O arquivo da arte chega pelo WhatsApp, aqui fica o registro do pedido.
      </p>

      {lista.length === 0 ? (
        <p className="text-xl font-medium">Nenhuma encomenda ainda.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {lista.map((c) => (
            <article key={c.id} className="border-2 border-foreground">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground p-5">
                <div>
                  <h2 className="font-display text-4xl uppercase leading-none">
                    EP-{String(c.id).padStart(5, "0")}
                  </h2>
                  <p className="mt-1 text-base font-medium">{dataHora.format(c.createdAt)}</p>
                </div>
                <span className="border-2 border-foreground px-3 py-1 font-mono text-sm uppercase">{c.status}</span>
              </header>

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

              <form action={changeCustomStatusAction} className="flex flex-wrap items-center gap-3 border-t-2 border-foreground p-5">
                <input type="hidden" name="id" value={c.id} />
                <label htmlFor={`status-${c.id}`} className="font-mono text-sm uppercase tracking-[0.15em]">
                  Status
                </label>
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
