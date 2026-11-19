// ============================================================================
// Fundo tipográfico da ABERTURA da home: a palavra "DarkWear" repetida em linhas gigantes, que
// derivam devagar (umas para a esquerda, outras para a direita), ao fundo do título principal.
// É puramente decorativo (aria-hidden) e de baixo contraste, de propósito, para o título mandar.
// (Para o mesmo efeito com outra palavra em outras seções, veja TypeBackdrop.)
// ============================================================================

// Fundo tipográfico do hero: a palavra da marca em linhas gigantes, alternando contorno fino
// e preenchimento quase preto. Baixo contraste de propósito, para o título principal mandar.
// Cada linha: "outline" = só contorno (true) ou preenchida (false); "dir" = classe de animação que
// define para que lado a linha deriva (veja motion.css); "offset" = deslocamento lateral inicial,
// para as linhas não ficarem alinhadas e o fundo parecer orgânico.
const ROWS = [
  { outline: true, dir: "drift-left", offset: "0%" },
  { outline: false, dir: "drift-right", offset: "0%" },
  { outline: true, dir: "drift-left", offset: "-18%" },
  { outline: false, dir: "drift-right", offset: "-8%" },
];

export function HeroType() {
  return (
    // Cobre toda a seção (absolute inset-0), fica atrás do conteúdo (-z-10) e não recebe cliques
    // (pointer-events-none). A máscara esmaece o fundo de cima para baixo (some no final).
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
      style={{ maskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)" }}
    >
      <div className="flex flex-col" style={{ marginTop: "-2vw" }}>
        {ROWS.map((r, i) => (
          <div key={i} className="whitespace-nowrap leading-[0.82]" style={{ marginLeft: r.offset }}>
            {/* O texto é desenhado DUAS vezes lado a lado (k = 0 e 1) e a animação anda metade da
                largura: quando termina e recomeça, a emenda é invisível (loop contínuo). */}
            <div className={`${r.dir} inline-flex`}>
              {[0, 1].map((k) => (
                <span
                  key={k}
                  className="font-display uppercase"
                  style={{
                    fontSize: "clamp(7rem, 17vw, 17rem)",
                    paddingRight: "0.4em",
                    // Linhas "contorno": texto transparente com traço fino branco translúcido.
                    // Linhas "cheias": quase pretas (#151515), só um pouco mais claras que o fundo.
                    color: r.outline ? "transparent" : "#151515",
                    WebkitTextStroke: r.outline ? "1px rgba(255,255,255,0.16)" : "0",
                  }}
                >
                  DarkWear · DarkWear · DarkWear ·
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
