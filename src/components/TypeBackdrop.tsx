// Fundo tipográfico reutilizável: a palavra da seção em linhas gigantes que derivam devagar.
// "dark" para blocos pretos, "light" para blocos brancos. Baixo contraste de propósito.
type Props = {
  text: string;
  rows?: number;
  tone?: "dark" | "light";
  fade?: "bottom" | "top" | "none";
  size?: string;
};

const MASK = {
  bottom: "linear-gradient(to bottom, #000 0%, #000 50%, transparent 100%)",
  top: "linear-gradient(to top, #000 0%, #000 50%, transparent 100%)",
  none: "none",
} as const;

export function TypeBackdrop({ text, rows = 3, tone = "dark", fade = "none", size = "clamp(6rem, 14vw, 14rem)" }: Props) {
  const dark = tone === "dark";
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
          const outline = i % 2 === 0;
          return (
            <div key={i} className="whitespace-nowrap leading-[0.82]" style={{ marginLeft: `${-(i * 11) % 30}%` }}>
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
