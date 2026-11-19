// ============================================================================
// SELETOR DE POSIÇÃO DA ARTE (página /personalizar, passo "4. Onde a arte vai").
//
// Quatro botões grandes (Peito, Frente, Costas, Manga), cada um com uma frase explicando a posição.
// Sem desenho de camiseta, de propósito: a escolha é feita só com tipografia. (O nome do arquivo é
// histórico; antes ele desenhava uma camiseta clicável.) As opções vêm de custom-order-options.ts.
// ============================================================================

"use client";

// Escolha de onde a arte vai: quatro botões grandes, sem desenho de camiseta.
import { PLACEMENTS, type PlacementId } from "@/lib/custom-order-options";

export function ShirtPlacer({
  value,
  onChange,
}: {
  // A posição escolhida agora, e a função chamada quando o cliente escolhe outra.
  value: PlacementId;
  onChange: (id: PlacementId) => void;
}) {
  return (
    // role="group" + aria-label: leitores de tela anunciam "grupo: Onde a arte vai" antes dos botões.
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Onde a arte vai">
      {PLACEMENTS.map((p) => {
        const on = value === p.id;
        return (
          // O escolhido fica preenchido; os outros invertem as cores ao passar o mouse.
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
