// ============================================================================
// Tela de cupons do painel: /admin/cupons. A ideia: o TALÃO.
//
// Cada cupom é um tíquete de papel branco com o picote tracejado no meio, como os de um talão de rifa: de um lado o
// código em letras de máquina e o desconto em letras gigantes; do outro, a situação (ativo, vencido, esgotado...), os
// usos e as regras. O dono cria um cupom novo no formulário de cima e liga ou desliga cada um com um botão. Cupom nunca
// é apagado (os pedidos que o usaram apontam para ele): desativa-se.
//
// Também mostra o desconto do Pix, que não é um cupom: é uma configuração (PIX_DISCOUNT_PERCENT) que o dono liga no servidor.
// De onde vêm os dados: listCoupons (src/server/coupons.ts). O botão chama setCouponActiveAction.
// ============================================================================

import type { Metadata } from "next";
import { setCouponActiveAction } from "@/app/admin/actions";
import { CabecalhoDePagina } from "@/components/admin/CabecalhoDePagina";
import { rotuloDoDesconto, situacaoDoCupom, type SituacaoDoCupom } from "@/lib/discounts";
import { formatCents } from "@/lib/money";
import { requireAdmin } from "@/server/admin/auth";
import { listCoupons, pixDescontoPercent } from "@/server/coupons";
import { CupomForm } from "./CupomForm";

// Página privada: bloqueia no servidor até validar a sessão (sem casca estática instantânea).
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Cupons · Painel DarkWear" } };

const dia = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

const PALAVRA: Record<SituacaoDoCupom, string> = { ativo: "Ativo", desativado: "Desativado", agendado: "Agendado", vencido: "Vencido", esgotado: "Esgotado" };

export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ criado?: string }> }) {
  await requireAdmin();
  const { criado } = await searchParams;
  const cupons = await listCoupons();
  const pix = pixDescontoPercent();
  const agora = new Date();

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoDePagina
        sobretitulo="Vendas"
        titulo="Cupons"
        descricao="Códigos de desconto para o cliente digitar na sacola. Cada cliente usa o mesmo cupom uma vez."
      />

      {criado ? (
        <p role="status" className="border-2 border-foreground p-4 text-lg font-bold">
          Cupom criado.
        </p>
      ) : null}

      {/* O desconto do Pix é uma configuração do servidor, não um cupom: aqui só aparece o estado atual. */}
      <p className="border-2 border-dashed border-foreground p-4 text-lg font-medium">
        <strong className="font-bold">Desconto no Pix:</strong>{" "}
        {pix > 0
          ? `${pix}% para quem escolher pagar por Pix na sacola (ligado).`
          : "desligado. Para ligar, defina PIX_DISCOUNT_PERCENT (de 1 a 30) nas variáveis de ambiente do servidor."}
      </p>

      <section aria-labelledby="novo-cupom" className="flex flex-col gap-4">
        <h2 id="novo-cupom" className="font-display text-4xl uppercase leading-none">
          Novo cupom
        </h2>
        <CupomForm />
      </section>

      <section aria-labelledby="talao" className="flex flex-col gap-4">
        <h2 id="talao" className="font-display text-4xl uppercase leading-none">
          Talão
        </h2>
        {cupons.length === 0 ? (
          <p className="text-xl font-medium">Nenhum cupom ainda. Crie o primeiro acima.</p>
        ) : (
          <ul className="grid gap-6 lg:grid-cols-2">
            {cupons.map((c) => {
              const situacao = situacaoDoCupom(c, agora);
              const vale = situacao === "ativo";
              return (
                <li key={c.code} className="flex bg-foreground text-background">
                  {/* Lado do desconto. */}
                  <div className="flex flex-1 flex-col justify-between gap-4 p-5 font-mono">
                    <p className="text-sm font-bold uppercase tracking-[0.15em]">{PALAVRA[situacao]}</p>
                    <div>
                      <p className="break-all text-2xl font-bold">{c.code}</p>
                      <p className="font-display text-5xl uppercase leading-none">{rotuloDoDesconto(c)}</p>
                    </div>
                    <form action={setCouponActiveAction}>
                      <input type="hidden" name="code" value={c.code} />
                      <input type="hidden" name="active" value={String(!c.active)} />
                      <button
                        type="submit"
                        className="border-2 border-background px-4 py-2 text-sm font-bold uppercase transition-colors hover:bg-background hover:text-foreground"
                      >
                        {c.active ? "Desativar" : "Ativar"}
                      </button>
                    </form>
                  </div>
                  {/* O picote. */}
                  <div aria-hidden="true" className="border-l-2 border-dashed border-background" />
                  {/* Lado das regras. */}
                  <dl className="flex w-44 shrink-0 flex-col gap-2 p-4 font-mono text-xs font-bold uppercase tracking-[0.08em]">
                    <div>
                      <dt>Usos</dt>
                      <dd className="text-base">{c.maxUses === null ? `${c.usedCount}` : `${c.usedCount} de ${c.maxUses}`}</dd>
                    </div>
                    <div>
                      <dt>Mínimo</dt>
                      <dd className="text-base">{c.minOrderCents > 0 ? formatCents(c.minOrderCents) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Período</dt>
                      <dd className="text-sm">
                        {c.startsAt ? dia.format(c.startsAt) : "sempre"} → {c.expiresAt ? dia.format(new Date(c.expiresAt.getTime() - 1)) : "sem fim"}
                      </dd>
                    </div>
                    {!vale && situacao !== "desativado" ? <p className="mt-auto underline underline-offset-4">Não vale agora</p> : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
