// ============================================================================
// Formulário "Novo cupom" do painel (/admin/cupons).
//
// É componente de navegador ("use client") para mostrar "Criando…" durante o envio, exibir o erro do servidor e MANTER o
// que o dono digitou quando há erro (o React limpa o formulário depois de cada envio; os campos voltam a ser
// preenchidos com state.values). A validação de verdade é do servidor (parseCouponForm).
// ============================================================================

"use client";

import { useActionState, useState } from "react";
import { createCouponAction, type FormState } from "@/app/admin/actions";

const rotulo = "font-mono text-xs font-bold uppercase tracking-[0.15em]";
const campo = "w-full border-2 border-foreground bg-transparent px-3 py-2 text-lg font-medium text-foreground outline-none placeholder:italic placeholder:text-foreground focus:bg-foreground focus:text-background focus:placeholder:text-background";

export function CupomForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createCouponAction, {});
  const v = (nome: string, padrao = "") => state.values?.[nome] ?? padrao;
  // O tipo escolhido muda o rótulo do valor ("%" ou "R$").
  const [tipo, setTipo] = useState<string>(v("kind", "percent"));

  return (
    <form action={action} className="grid gap-6 border-2 border-foreground p-6 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor="code" className={rotulo}>Código</label>
        <input id="code" name="code" required maxLength={30} autoComplete="off" placeholder="BEMVINDO10" defaultValue={v("code")} className={`${campo} uppercase`} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="kind" className={rotulo}>Tipo</label>
        <select id="kind" name="kind" value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${campo} bg-background`}>
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo (R$)</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="value" className={rotulo}>{tipo === "percent" ? "Desconto (1 a 90 %)" : "Desconto (R$)"}</label>
        <input id="value" name="value" required inputMode="decimal" placeholder={tipo === "percent" ? "10" : "15,00"} defaultValue={v("value")} className={campo} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="min" className={rotulo}>Pedido mínimo (R$, opcional)</label>
        <input id="min" name="min" inputMode="decimal" placeholder="150,00" defaultValue={v("min")} className={campo} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="maxUses" className={rotulo}>Limite de usos (opcional)</label>
        <input id="maxUses" name="maxUses" inputMode="numeric" placeholder="100" defaultValue={v("maxUses")} className={campo} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="startsAt" className={rotulo}>Vale a partir de (opcional)</label>
        <input id="startsAt" name="startsAt" type="date" defaultValue={v("startsAt")} className={campo} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="expiresAt" className={rotulo}>Vale até o fim do dia (opcional)</label>
        <input id="expiresAt" name="expiresAt" type="date" defaultValue={v("expiresAt")} className={campo} />
      </div>

      <label className="flex items-center gap-3 self-end text-lg font-medium">
        <input type="checkbox" name="active" defaultChecked={state.values ? state.values.active === "on" : true} className="h-5 w-5 accent-white" />
        Já começa ativo
      </label>

      {state.error ? (
        <p role="alert" className="border-2 border-foreground p-3 text-base font-bold sm:col-span-2">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="border-2 border-foreground bg-foreground px-6 py-3 font-display text-2xl uppercase tracking-wide text-background transition-colors enabled:hover:bg-transparent enabled:hover:text-foreground disabled:cursor-wait sm:col-span-2 sm:justify-self-start"
      >
        {pending ? "Criando…" : "Criar cupom"}
      </button>
    </form>
  );
}
