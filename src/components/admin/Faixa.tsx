// ============================================================================
// FAIXA: o letreiro que corre no topo de todas as telas do painel.
//
// A ideia: o painel de uma loja de verdade tem um letreiro, e este é o da DarkWear. Uma tira branca com texto
// preto em letras de máquina, correndo da direita para a esquerda, dizendo de relance o que espera pelo dono
// ("Atenção: 1 pagamento para conferir ✦ 3 pedidos esperando pagamento ✦ ..."). Passar o mouse pausa.
//
// Quem pediu "reduzir movimento" no sistema vê a faixa PARADA, com as frases quebrando em linhas (nada some).
// O texto é duplicado para o loop não ter emenda; a cópia é escondida de leitores de tela.
// O visual da animação está em motion.css (.faixa e .faixa-corre).
// ============================================================================

export function Faixa({ itens }: { itens: string[] }) {
  return (
    <div role="status" aria-label="O que espera por você" className="faixa overflow-hidden bg-foreground text-background">
      <div className="faixa-corre flex w-max motion-reduce:w-auto">
        {[0, 1].map((copia) => (
          <ul
            key={copia}
            // A segunda cópia só existe para o loop: leitores de tela e quem reduziu o movimento não a veem.
            aria-hidden={copia === 1 ? true : undefined}
            className={`flex shrink-0 items-center gap-x-8 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.2em] motion-reduce:flex-wrap ${copia === 1 ? "motion-reduce:hidden" : ""}`}
          >
            {itens.map((item) => (
              <li key={item} className="flex items-center gap-x-8 whitespace-nowrap">
                {item}
                <span aria-hidden="true">✦</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
