// ============================================================================
// RECIBO: o papel de "fechamento de caixa" do painel.
//
// A ideia: o mesmo papel branco de máquina da sacola do cliente, só que do outro lado do balcão. Em vez dos
// itens de uma compra, as linhas do mês (pedidos pagos, ticket médio, pedidos de hoje...) com pontilhado até o
// valor e, embaixo, o total em letras grandes, com a borda serrilhada de recibo.
//
// Quem usa: a tela inicial do painel (/admin). Os valores chegam prontos: aqui só se desenha.
// ============================================================================

import type { ReactNode } from "react";

export function Recibo({
  cabecalho,
  periodo,
  linhas,
  totalRotulo,
  total,
  rodape,
}: {
  /** O nome da loja, em cima (ex.: "DarkWear"). */
  cabecalho: string;
  /** O período do fechamento (ex.: "novembro de 2026"). */
  periodo: string;
  /** As linhas do recibo: rótulo à esquerda, valor à direita, pontilhado no meio. */
  linhas: { rotulo: string; valor: ReactNode }[];
  totalRotulo: string;
  total: ReactNode;
  /** Uma frase pequena no pé do recibo. */
  rodape?: string;
}) {
  return (
    <div>
      <div className="bg-foreground px-6 pb-8 pt-7 font-mono text-background">
        <div className="flex items-baseline justify-between border-b-2 border-dashed border-background pb-4">
          <span className="font-display text-3xl uppercase leading-none">{cabecalho}</span>
          <span className="text-sm font-bold uppercase tracking-[0.12em]">Fechamento</span>
        </div>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.15em]">{periodo}</p>

        <dl className="mt-4 divide-y-2 divide-dashed divide-background">
          {linhas.map((l) => (
            <div key={l.rotulo} className="flex items-end gap-2 py-3 text-base font-bold uppercase">
              <dt>{l.rotulo}</dt>
              {/* O pontilhado: uma linha que ocupa o espaço entre o rótulo e o valor (flex-1). */}
              <span aria-hidden="true" className="mb-1 flex-1 border-b-2 border-dotted border-background" />
              <dd>{l.valor}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-2 border-t-2 border-dashed border-background pt-5">
          <p className="text-sm font-bold uppercase tracking-[0.15em]">{totalRotulo}</p>
          <p className="mt-1 font-display text-[clamp(3.25rem,6vw,4.75rem)] leading-none">{total}</p>
        </div>
        {rodape ? <p className="mt-5 text-sm font-medium">{rodape}</p> : null}
      </div>
      {/* A borda serrilhada do papel: dois degradês em ponta que se repetem (enfeite, por isso aria-hidden). */}
      <div
        aria-hidden="true"
        className="h-3 w-full"
        style={{
          background:
            "linear-gradient(135deg, var(--foreground) 50%, transparent 50%) 0 0 / 16px 12px, linear-gradient(225deg, var(--foreground) 50%, transparent 50%) 0 0 / 16px 12px",
          backgroundRepeat: "repeat-x",
        }}
      />
    </div>
  );
}
