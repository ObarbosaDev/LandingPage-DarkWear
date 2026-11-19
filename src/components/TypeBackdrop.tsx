// ============================================================================
// FUNDO TIPOGRÁFICO reutilizável: uma palavra (a da seção) repetida em linhas gigantes que derivam
// devagar ao fundo de um bloco. Usado na home (Catálogo, Como funciona, Manda a arte) e no rodapé.
// É só decoração (aria-hidden): baixo contraste, de propósito, para o conteúdo da seção mandar.
// ============================================================================

// Fundo tipográfico reutilizável: a palavra da seção em linhas gigantes que derivam devagar.
// "dark" para blocos pretos, "light" para blocos brancos. Baixo contraste de propósito.
type Props = {
  text: string; // a palavra ou frase a repetir
  rows?: number; // quantas linhas
  tone?: "dark" | "light"; // cores para fundo preto ("dark") ou branco ("light")
  fade?: "bottom" | "top" | "none"; // de que lado o fundo esmaece até sumir
  size?: string; // tamanho da letra (qualquer medida CSS)
};

// As máscaras que esmaecem o fundo: "bottom" some embaixo, "top" some em cima, "none" não esmaece.
const MASK = {
  bottom: "linear-gradient(to bottom, #000 0%, #000 50%, transparent 100%)",
  top: "linear-gradient(to top, #000 0%, #000 50%, transparent 100%)",
  none: "none",
} as const;

export function TypeBackdrop({ text, rows = 3, tone = "dark", fade = "none", size = "clamp(6rem, 14vw, 14rem)" }: Props) {
  const dark = tone === "dark";
  // Cores do contorno e do preenchimento: bem próximas do fundo, só o suficiente para se perceber.
  const stroke = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)";
  const fill = dark ? "#151515" : "#e6e6e6";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
      style={{ maskImage: MASK[fade] }}
    >
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, i) => {
          // Linhas pares: só contorno. Linhas ímpares: preenchidas. Alternar dá textura.
          const outline = i % 2 === 0;
          return (
            // O deslocamento lateral muda a cada linha (0, -11%, -22%, depois volta), para as
            // linhas não ficarem alinhadas entre si.
            <div key={i} className="whitespace-nowrap leading-[0.82]" style={{ marginLeft: `${-(i * 11) % 30}%` }}>
              {/* Linhas pares derivam para a esquerda e as ímpares para a direita (sentidos opostos).
                  O texto é desenhado duas vezes lado a lado, e a animação anda metade da largura:
                  o recomeço fica invisível, formando um loop contínuo. */}
              <div className={`${i % 2 === 0 ? "drift-left" : "drift-right"} inline-flex`}>
                {[0, 1].map((k) => (
                  <span
                    key={k}
                    className="font-display uppercase"
                    style={{
                      fontSize: size,
                      paddingRight: "0.4em",
                      color: outline ? "transparent" : fill,
                      WebkitTextStroke: outline ? `1px ${stroke}` : "0",
                    }}
                  >
                    {`${text} · ${text} · ${text} ·`}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
