// ============================================================================
// ARARA: a etiqueta pendurada, usada nas telas da conta do cliente (/conta e /conta/pedidos).
//
// A ideia visual: cada coisa da conta é uma etiqueta de papel branco pendurada numa barra de arara por
// um fio curto, com o furo no topo. O texto dentro do papel é sempre preto (sem cinza fraco).
//
// Cada etiqueta traz o SEU trecho de barra, e a grade que as junta não tem espaço entre as colunas: os
// trechos se emendam e cada fila tem a sua própria arara. Assim nenhuma etiqueta fica pendurada no vazio,
// qualquer que seja a quantidade ou a largura da tela.
// A barra, o fio e o furo são enfeite (aria-hidden); o conteúdo é só o que está dentro do papel.
// ============================================================================

import type { ReactNode } from "react";

/** A grade que emenda as etiquetas. Use como pai direto das <Etiqueta>. */
export function Arara({ children }: { children: ReactNode }) {
  return <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

/**
 * Uma etiqueta da arara.
 * @param titulo  a legenda pequena no topo do papel (também é o nome acessível da seção)
 * @param id      âncora opcional (ex.: a sacola leva a /conta#endereco)
 */
export function Etiqueta({ titulo, id, children }: { titulo: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={titulo} className="relative flex flex-col items-center px-4 pb-6 scroll-mt-24">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 block h-1.5 bg-foreground" />
      <span aria-hidden="true" className="mt-1.5 block h-8 w-0.5 bg-foreground" />
      <div className="relative w-full bg-foreground px-6 pb-7 pt-9 text-background">
        <span aria-hidden="true" className="absolute left-1/2 top-3 block h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-background" />
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">{titulo}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}
