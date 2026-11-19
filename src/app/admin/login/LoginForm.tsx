"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-5">
      <label htmlFor="senha" className="font-mono text-sm uppercase tracking-[0.15em]">
        Senha do painel
      </label>
      <input
        id="senha"
        name="senha"
        type="password"
        required
        autoComplete="current-password"
        autoFocus
        className="w-full border-2 border-foreground bg-transparent px-4 py-3 text-lg font-medium text-foreground outline-none focus:bg-foreground focus:text-background"
      />
      {state.error ? (
        <p role="alert" className="border-2 border-foreground p-3 text-lg font-bold">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="border-2 border-foreground bg-foreground px-8 py-4 font-display text-2xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground disabled:cursor-wait"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
