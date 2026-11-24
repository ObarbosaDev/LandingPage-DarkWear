// ============================================================================
// Botão "Senha provisória" de cada cliente em /admin/clientes.
//
// Para quê: ainda não há recuperação de senha por e-mail. Quem esqueceu a senha pede ao dono, que gera uma
// provisória aqui e a passa pelo WhatsApp. O cliente é obrigado a trocá-la no próximo login.
//
// Dois cuidados:
//   - é em DUAS etapas (clicar, depois confirmar), porque gerar a senha DESCONECTA o cliente de todos os
//     aparelhos e invalida a senha que ele tem hoje;
//   - a senha provisória é mostrada UMA vez, aqui, junto de um botão de copiar. Não fica guardada em claro.
//
// É componente de navegador ("use client") porque guarda o passo (clicou ou confirmou) e mostra o retorno.
// Quem decide é o servidor (resetCustomerPasswordAction); contas de administrador são recusadas lá.
// ============================================================================

"use client";

import { useActionState, useState } from "react";
import { resetCustomerPasswordAction, type SenhaProvisoriaState } from "@/app/admin/actions";

const botao =
  "border-2 border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-foreground hover:text-background disabled:cursor-wait";

export function SenhaProvisoria({ id, nome }: { id: number; nome: string }) {
  const [estado, acao, pending] = useActionState<SenhaProvisoriaState, FormData>(resetCustomerPasswordAction, {});
  // Primeira etapa: o botão simples. Segunda: o aviso do que vai acontecer e o botão de confirmar.
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // A senha já foi gerada: mostra-a (uma vez) com o botão de copiar.
  if (estado.senha) {
    return (
      <div className="flex flex-col gap-2 border-2 border-foreground p-4">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">Senha provisória de {estado.para || nome}</p>
        <p className="select-all font-mono text-2xl font-bold tracking-wider">{estado.senha}</p>
        <p className="text-base font-medium">Anote ou copie agora: ela não aparece de novo. O cliente troca a senha no próximo login.</p>
        <button
          type="button"
          className={botao}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(estado.senha ?? "");
              setCopiado(true);
            } catch {
              setCopiado(false); // sem permissão da área de transferência: a senha está selecionável acima
            }
          }}
        >
          {copiado ? "Copiada" : "Copiar senha"}
        </button>
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button type="button" className={botao} onClick={() => setConfirmando(true)}>
        Senha provisória
      </button>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-2 border-2 border-foreground p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="nome" value={nome} />
      <p className="text-base font-bold">Isto troca a senha de {nome.split(" ")[0]} e o desconecta de todos os aparelhos. Continuar?</p>
      {estado.error ? (
        <p role="alert" className="border-2 border-foreground p-2 text-base font-bold">
          {estado.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="border-2 border-foreground bg-foreground px-4 py-2 text-base font-bold text-background transition-colors hover:bg-transparent hover:text-foreground disabled:cursor-wait">
          {pending ? "Gerando…" : "Sim, gerar"}
        </button>
        <button type="button" onClick={() => setConfirmando(false)} className={botao}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
