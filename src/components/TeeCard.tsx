import { SITE, formatBRL } from "@/lib/site";
import { whatsappLink } from "@/lib/whatsapp";
import type { PlacementId } from "@/components/ShirtPlacer";

// Preço de partida: exemplo. Troque pelo valor real da encomenda personalizada.
const PRICE_FROM = 70;

// Posição do texto de exemplo sobre a camiseta, por zona de estampa.
const TEXT_AT: Record<PlacementId, { x: number; y: number; size: number }> = {
  peito: { x: 150, y: 150, size: 14 },
  frente: { x: 200, y: 230, size: 22 },
  costas: { x: 200, y: 230, size: 22 },
  manga: { x: 310, y: 170, size: 13 },
};

export function TeeCard({ placement }: { placement: PlacementId }) {
  const at = TEXT_AT[placement];

  return (
    <article className="grid border-4 border-accent md:grid-cols-2">
      <div className="flex items-center justify-center bg-surface p-8">
        <svg viewBox="0 0 400 400" className="h-auto w-full max-w-sm" role="img" aria-label="Camiseta preta com a sua ideia estampada">
          {/* Silhueta oversized, mangas largas */}
          <path
            d="M150 58 Q200 84 250 58 L320 88 L368 150 L334 176 L308 146 L306 330 Q306 346 290 346 L110 346 Q94 346 94 330 L92 146 L66 176 L32 150 L80 88 Z"
            fill="#0d0d0d"
            stroke="#2a2a2a"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Gola e costuras */}
          <path d="M150 58 Q200 96 250 58" fill="none" stroke="#2a2a2a" strokeWidth="5" />
          <path d="M150 58 Q200 96 250 58" fill="none" stroke="#f5f5f5" strokeWidth="1" strokeDasharray="3 3" />
          {/* Sombra de caimento */}
          <path d="M120 120 Q130 240 118 330" fill="none" stroke="#1f1f1f" strokeWidth="6" />
          <path d="M280 120 Q270 240 282 330" fill="none" stroke="#1f1f1f" strokeWidth="6" />
          {/* Estampa de exemplo */}
          <text
            x={at.x}
            y={at.y}
            textAnchor="middle"
            fill="#f5f5f5"
            fontSize={at.size}
            fontWeight="900"
            style={{ fontFamily: "var(--font-sans), Arial, sans-serif" }}
          >
            Sua ideia aqui
          </text>
        </svg>
      </div>

      <div className="flex flex-col justify-between gap-8 bg-background p-8">
        <div className="flex flex-col gap-4">
          <h2 className="display text-5xl">Camiseta personalizada</h2>
          <p className="text-lg">
            A partir de <span className="text-4xl font-semibold text-foreground">{formatBRL(PRICE_FROM)}</span>
          </p>
          <p className="text-muted">Personalizamos a partir de uma peça.</p>
        </div>

        <a
          href={whatsappLink(`Olá! Vim pelo site da ${SITE.name} e quero falar com um atendente sobre a camiseta personalizada.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="street-btn street-btn--red w-full justify-between"
        >
          Falar com atendente
          <span className="arrow" aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
