// ============================================================================
// Formulário de senha da tela /admin/login.
//
// É um componente de navegador ("use client") porque precisa reagir ao envio: mostrar "Entrando…"
// enquanto o servidor confere a senha e exibir "Senha incorreta." sem recarregar a página.
// A conferência em si acontece no servidor, em loginAction.
// ============================================================================

"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/admin/actions";

export function LoginForm() {
  // useActionState liga o formulário à ação do servidor e devolve:
  //   state   → a última resposta (ex.: { error: "Senha incorreta." }), começando vazio;
  //   action  → a função que o <form> chama ao enviar;
  //   pending → true enquanto o servidor ainda está respondendo.
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-5">
      <label htmlFor="senha" className="font-mono text-sm uppercase tracking-[0.15em]">
        Senha do painel
      </label>
      {/* type="password" esconde o que é digitado; autoFocus já deixa o cursor no campo;
          autoComplete permite o gerenciador de senhas do navegador preencher. */}
      <input
        id="senha"
        name="senha"
        type="password"
        required
        autoComplete="current-password"
        autoFocus
        className="w-full border-2 border-foreground bg-transparent px-4 py-3 text-lg font-medium text-foreground outline-none focus:bg-foreground focus:text-background"
      />
      {/* Mensagem de erro do servidor (senha errada, muitas tentativas...). role="alert" faz o
          leitor de tela anunciar o erro assim que ele aparece. */}
      {state.error ? (
        <p role="alert" className="border-2 border-foreground p-3 text-lg font-bold">
          {state.error}
        </p>
      ) : null}
      {/* Desabilitado enquanto envia, para o dono não clicar duas vezes. */}
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
