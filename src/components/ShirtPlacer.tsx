"use client";

// Escolha de onde a arte vai: quatro botões grandes, sem desenho de camiseta.
import { PLACEMENTS, type PlacementId } from "@/lib/custom-order-options";

export function ShirtPlacer({
  value,
  onChange,
}: {
  value: PlacementId;
  onChange: (id: PlacementId) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Onde a arte vai">
      {PLACEMENTS.map((p) => {
        const on = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={on}
            className={`flex flex-col items-start gap-2 border-2 border-background p-5 text-left transition-colors ${
              on ? "bg-background text-foreground" : "hover:bg-background hover:text-foreground"
            }`}
          >
            <span className="font-display text-4xl uppercase leading-none">{p.label}</span>
            <span className="text-base font-medium">{p.note}</span>
          </button>
        );
      })}
    </div>
  );
}
