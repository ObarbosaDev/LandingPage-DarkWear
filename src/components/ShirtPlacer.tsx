"use client";

// Ícone de camiseta com zonas clicáveis para escolher onde a arte vai.
export const PLACEMENTS = [
  { id: "peito", label: "Peito esquerdo", x: 66, y: 34 },
  { id: "frente", label: "Frente centro", x: 100, y: 62 },
  { id: "costas", label: "Costas", x: 100, y: 62, back: true },
  { id: "manga", label: "Manga", x: 150, y: 46 },
] as const;

export type PlacementId = (typeof PLACEMENTS)[number]["id"];

export function ShirtPlacer({
  value,
  onChange,
}: {
  value: PlacementId;
  onChange: (id: PlacementId) => void;
}) {
  const current = PLACEMENTS.find((p) => p.id === value)!;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 220" className="h-72 w-auto" role="img" aria-label="Camiseta, escolha onde a arte vai">
        {/* Corpo da camiseta */}
        <path
          d="M70 20 L40 38 L10 68 L30 92 L50 80 L50 200 L150 200 L150 80 L170 92 L190 68 L160 38 L130 20 Q100 36 70 20 Z"
          fill="#111"
          stroke="#f5f5f5"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Costura da gola */}
        <path d="M70 20 Q100 36 130 20" fill="none" stroke="#f5f5f5" strokeWidth="2" />

        {/* Marcador da posição escolhida */}
        <circle cx={current.x} cy={current.y} r="9" fill="#f5f5f5" stroke="#000" strokeWidth="2" />
        <circle cx={current.x} cy={current.y} r="3" fill="#000" />
        <text
          x="100"
          y="128"
          textAnchor="middle"
          fill="#f5f5f5"
          fontSize="11"
          fontWeight="900"
          style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {current.label}
        </text>

        {/* Zonas clicáveis invisíveis */}
        {PLACEMENTS.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r="22"
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onChange(p.id)}
          >
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>

      <div className="flex flex-wrap justify-center gap-2">
        {PLACEMENTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`border-2 px-3 py-2 text-xs font-black uppercase tracking-wider ${
              value === p.id
                ? "border-foreground bg-foreground text-background"
                : "border-foreground text-foreground hover:bg-foreground hover:text-background"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
