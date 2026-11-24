// ============================================================================
// ETIQUETA: a tela de CADASTRO (/conta/cadastro), feita como a etiqueta de uma camiseta.
//
// A ideia: uma etiqueta de papel branco, com o furo do cordão no topo e uma costura tracejada por dentro.
// Os campos são as linhas da etiqueta (NOME, E-MAIL, CELULAR, SENHA) e, ao lado, as "instruções de
// cuidado" explicam, no jeito de etiqueta de lavagem, o que fazemos com os dados e o que se espera da senha.
//
// Quem usa: src/app/(site)/conta/cadastro/page.tsx. O formulário chama registerAction.
// A senha NUNCA volta ao formulário depois de um erro (o campo fica vazio de propósito); o resto sim.
// ============================================================================

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type ClienteFormState } from "@/app/actions-cliente";

const rotulo = "font-mono text-xs font-bold uppercase tracking-[0.18em]";
const campo =
  "w-full border-0 border-b-2 border-background bg-transparent py-2 font-mono text-lg text-background outline-none transition-colors focus:bg-background focus:px-2 focus:text-foreground";

// As "instruções de cuidado" (texto de etiqueta de lavagem, só que sobre a conta).
const CUIDADOS = [
  ["01", "Senha com 10 caracteres ou mais. Uma frase que só você conhece funciona melhor que uma palavra."],
  ["02", "Seus dados ficam só com a gente e servem para entregar e acompanhar seus pedidos."],
  ["03", "Pode sair de todos os aparelhos a qualquer hora, e excluir a conta quando quiser."],
];

export function Etiqueta({ next }: { next: string }) {
  const [estado, acao, pending] = useActionState<ClienteFormState, FormData>(registerAction, {});
  const v = (nome: string) => estado.values?.[nome] ?? "";

  return (
    <div className="relative bg-foreground px-5 pb-8 pt-14 text-background sm:px-9">
      {/* O furo do cordão: um círculo preto no topo da etiqueta (enfeite, por isso aria-hidden). */}
      <span aria-hidden="true" className="absolute left-1/2 top-4 block h-5 w-5 -translate-x-1/2 rounded-full bg-background" />

      {/* A costura: borda tracejada por dentro da etiqueta. */}
      <div className="border-2 border-dashed border-background p-5 sm:p-8">
        <div className="flex items-baseline justify-between border-b-2 border-dashed border-background pb-4">
          <span className="font-display text-3xl uppercase leading-none">DarkWear</span>
          <span className="font-mono text-xs font-bold uppercase tracking-[0.18em]">Etiqueta de cadastro</span>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_16rem]">
          <form action={acao} className="flex flex-col gap-6">
            <input type="hidden" name="next" value={next} />

            <div className="flex flex-col gap-1">
              <label htmlFor="name" className={rotulo}>Nome</label>
              <input id="name" name="name" required autoComplete="name" minLength={2} maxLength={80} defaultValue={v("name")} className={campo} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className={rotulo}>E-mail</label>
              <input id="email" name="email" type="email" required autoComplete="email" maxLength={254} defaultValue={v("email")} className={campo} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="phone" className={rotulo}>Celular (com DDD)</label>
              <input id="phone" name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="(11) 98765-4321" defaultValue={v("phone")} className={campo} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className={rotulo}>Senha (mínimo 10 caracteres)</label>
              <input id="password" name="password" type="password" required autoComplete="new-password" minLength={10} maxLength={128} className={campo} />
            </div>

            <label className="flex items-start gap-3 text-base font-medium">
              <input type="checkbox" name="privacy" required className="mt-1 h-5 w-5 accent-black" />
              <span>
                Li e aceito a{" "}
                <Link href="/privacidade" className="font-bold underline underline-offset-4">
                  política de privacidade
                </Link>
                .
              </span>
            </label>

            {estado.error ? (
              <p role="alert" className="border-2 border-background p-3 text-base font-bold">
                {estado.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="border-2 border-background bg-background px-6 py-4 font-display text-2xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait"
            >
              {pending ? "Costurando…" : "Costurar minha conta"}
            </button>
            <p className="text-base font-medium">
              Já tem conta?{" "}
              <Link href={next ? `/conta/entrar?next=${encodeURIComponent(next)}` : "/conta/entrar"} className="font-bold underline underline-offset-4">
                Entrar
              </Link>
            </p>
          </form>

          {/* As instruções de cuidado, no jeito da etiqueta de lavagem. */}
          <aside aria-label="Instruções de cuidado" className="border-t-2 border-dashed border-background pt-6 lg:border-l-2 lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className={rotulo}>Instruções de cuidado</p>
            <ol className="mt-4 flex flex-col gap-4">
              {CUIDADOS.map(([n, texto]) => (
                <li key={n} className="flex gap-3 text-base font-medium">
                  <span className="font-mono font-bold">{n}</span>
                  <span>{texto}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
