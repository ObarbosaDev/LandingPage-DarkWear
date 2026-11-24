// ============================================================================
// CABEÇALHO DE PÁGINA do painel: o bloco de título que abre toda tela de /admin.
//
// Por que existe: as telas do painel tinham cada uma o seu jeito de abrir. Aqui ficam um só: um sobretítulo
// pequeno em fonte mono (onde a pessoa está), o título gigante e, do lado direito, as ações da tela
// (um botão "Novo produto", um campo de busca...). Assim o painel inteiro tem o mesmo ritmo.
// ============================================================================

import type { ReactNode } from "react";

export function CabecalhoDePagina({
  sobretitulo,
  titulo,
  descricao,
  acoes,
}: {
  /** O texto pequeno de cima (ex.: "Operação"). */
  sobretitulo: string;
  titulo: string;
  /** Uma frase curta explicando o que se faz na tela. */
  descricao?: string;
  /** Botões ou formulários alinhados à direita (embaixo do título no celular). */
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-foreground pb-8">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">{sobretitulo}</p>
        <h1 className="font-display text-[clamp(3rem,8vw,6.5rem)] uppercase leading-[0.9]">{titulo}</h1>
        {descricao ? <p className="max-w-xl text-lg font-medium">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-3">{acoes}</div> : null}
    </header>
  );
}
