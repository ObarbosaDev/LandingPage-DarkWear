// Fundo tipográfico do hero: a palavra da marca em linhas gigantes, alternando contorno fino
// e preenchimento quase preto. Baixo contraste de propósito, para o título principal mandar.
const ROWS = [
  { outline: true, dir: "drift-left", offset: "0%" },
  { outline: false, dir: "drift-right", offset: "0%" },
  { outline: true, dir: "drift-left", offset: "-18%" },
  { outline: false, dir: "drift-right", offset: "-8%" },
];

export function HeroType() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
      style={{ maskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)" }}
    >
      <div className="flex flex-col" style={{ marginTop: "-2vw" }}>
        {ROWS.map((r, i) => (
          <div key={i} className="whitespace-nowrap leading-[0.82]" style={{ marginLeft: r.offset }}>
            <div className={`${r.dir} inline-flex`}>
              {[0, 1].map((k) => (
                <span
                  key={k}
                  className="font-display uppercase"
                  style={{
                    fontSize: "clamp(7rem, 17vw, 17rem)",
                    paddingRight: "0.4em",
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
