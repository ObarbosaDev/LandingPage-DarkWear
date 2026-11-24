// ============================================================================
// Formulários da página /conta: TROCAR A SENHA e EXCLUIR A CONTA.
//
// Quem usa: src/app/(site)/conta/page.tsx, dentro das etiquetas do "cabide".
// São componentes de navegador ("use client") porque mostram "Salvando…" durante o envio e exibem o
// retorno do servidor. Quem decide é o servidor (changePasswordAction e deleteAccountAction); as senhas
// nunca voltam para a tela.
// ============================================================================

"use client";

import { useActionState } from "react";
import { changePasswordAction, deleteAccountAction, type ClienteFormState } from "@/app/actions-cliente";

const rotulo = "font-mono text-xs font-bold uppercase tracking-[0.18em]";
const campo =
  "w-full border-0 border-b-2 border-background bg-transparent py-2 font-mono text-lg text-background outline-none transition-colors focus:bg-background focus:px-2 focus:text-foreground";
const botao =
  "border-2 border-background bg-background px-5 py-3 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait";

/** Retorno do servidor: erro (com role="alert", lido na hora por leitores de tela) ou aviso de sucesso. */
function Retorno({ estado }: { estado: ClienteFormState }) {
  if (estado.error) {
    return (
      <p role="alert" className="border-2 border-background p-3 text-base font-bold">
        {estado.error}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p role="status" className="border-2 border-background p-3 text-base font-bold">
        {estado.ok}
      </p>
    );
  }
  return null;
}

export function TrocarSenhaForm() {
  const [estado, acao, pending] = useActionState<ClienteFormState, FormData>(changePasswordAction, {});
  return (
    <form action={acao} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="current" className={rotulo}>Senha atual</label>
        <input id="current" name="current" type="password" required autoComplete="current-password" maxLength={128} className={campo} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="next" className={rotulo}>Nova senha (mínimo 10 caracteres)</label>
        <input id="next" name="next" type="password" required autoComplete="new-password" minLength={10} maxLength={128} className={campo} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirm" className={rotulo}>Repita a nova senha</label>
        <input id="confirm" name="confirm" type="password" required autoComplete="new-password" minLength={10} maxLength={128} className={campo} />
      </div>
      <Retorno estado={estado} />
      <button type="submit" disabled={pending} className={botao}>
        {pending ? "Salvando…" : "Trocar a senha"}
      </button>
    </form>
  );
}

export function ExcluirContaForm() {
  const [estado, acao, pending] = useActionState<ClienteFormState, FormData>(deleteAccountAction, {});
  return (
    <form action={acao} className="flex flex-col gap-5">
      <p className="text-base font-medium">
        Seu nome, e-mail e celular serão apagados e você sai de todos os aparelhos. Os pedidos já feitos ficam
        guardados na loja, sem ligação com os seus dados. Isto não pode ser desfeito.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor="senha-excluir" className={rotulo}>Digite a sua senha para confirmar</label>
        <input id="senha-excluir" name="password" type="password" required autoComplete="current-password" maxLength={128} className={campo} />
      </div>
      <Retorno estado={estado} />
      <button type="submit" disabled={pending} className={botao}>
        {pending ? "Excluindo…" : "Excluir minha conta"}
      </button>
    </form>
  );
}
