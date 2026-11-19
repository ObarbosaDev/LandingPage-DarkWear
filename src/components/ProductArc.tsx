// ============================================================================
// ARCO 3D de peças: o carrossel de cards que fica logo abaixo do título da home.
//
// Os cards (as três primeiras peças do catálogo) ficam dispostos em arco, com o do meio em destaque
// e os vizinhos menores, mais apagados e virados, dando profundidade. O cliente troca a peça em
// destaque de quatro jeitos: ARRASTANDO com o mouse/dedo, ROLANDO a roda do mouse, clicando nas
// SETAS ← → ou usando o teclado nos botões. Clicar num card leva à página da peça.
//
// Como funciona por dentro (resumo): existe um número "pos" (a posição do arco) que desliza
// suavemente até um "target" (o destino). A cada quadro da tela (~60 vezes por segundo) um laço
// (requestAnimationFrame) recalcula, para CADA card, o deslocamento, o tamanho, a rotação 3D, a
// transparência e o desfoque, conforme a distância dele ao centro. Isso é feito escrevendo direto no
// estilo dos elementos (e não via estado do React), porque redesenhar o componente 60 vezes por
// segundo seria pesado demais.
// ============================================================================

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/product";
import { ProductImage } from "@/components/ProductImage";
import { formatCents } from "@/lib/money";

// Arco de cards de vidro: arrastar, rolar, setas ou clique trocam a peça em destaque.
export function ProductArc({ products }: { products: Product[] }) {
  // N = quantas peças reais há.
  const N = products.length;
  // Repete a lista para o arco parecer contínuo nas duas pontas.
  // Com a lista dobrada, ao girar além do último card o primeiro já está esperando, sem "buraco".
  const items = [...products, ...products];
  const total = items.length;

  // Referências diretas aos elementos (palco e cards), para animá-los sem passar pelo React.
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Estado da animação, guardado fora do React (muda a cada quadro):
  //   pos      posição atual (decimal: 0 = primeiro card no centro, 1 = segundo...)
  //   target   para onde a posição está deslizando
  //   dragging true enquanto o usuário arrasta; x0/p0 = onde começou o arrasto; moved = se de fato arrastou
  const state = useRef({ pos: 0, target: 0, dragging: false, x0: 0, p0: 0, moved: false });
  // Índice da peça em destaque, para o texto embaixo ("01 / 03" e o nome).
  const [active, setActive] = useState(0);

  // O laço de animação: roda a cada quadro enquanto o componente está na tela.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = state.current;
      // Se o usuário não está arrastando, a posição desliza 12% do caminho até o destino a cada
      // quadro: começa rápido e vai "assentando" devagar (efeito de amortecimento).
      if (!s.dragging) s.pos += (s.target - s.pos) * 0.12;
      const stage = stageRef.current;
      const W = stage ? stage.clientWidth : 1000;
      // Largura de cada card: 28% da largura do palco, no máximo 260px.
      const cardW = Math.min(W * 0.28, 260);
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        // u = distância do card ao centro, em "cards" (negativa à esquerda, positiva à direita).
        // O cálculo com resto (%) faz a distância "dar a volta" no círculo de cards.
        const u = ((i - s.pos + total / 2) % total + total) % total - total / 2;
        const a = Math.abs(u); // quão longe do centro (0 = no centro)
        const sg = Math.sign(u) || 1; // lado: -1 esquerda, +1 direita
        // Deslocamento horizontal: cresce com a distância ao centro.
        const x = sg * a * cardW * 0.98;
        // Escala: o do centro é um pouco maior (1.08); quanto mais longe, menor (mínimo 0.6).
        const sc = Math.max(0.6, 1.08 - 0.2 * Math.min(a, 1) - 0.12 * Math.max(0, a - 1));
        // Profundidade: os cards longe do centro "afundam" na tela (eixo Z).
        const z = -120 * Math.max(0, a);
        // Rotação 3D: os cards das pontas giram para dentro, formando o arco (máximo 35 graus).
        const ry = -sg * Math.min(35, 14 + 8 * a);
        // Transparência: some gradualmente depois de 1,4 cards de distância.
        const op = Math.max(0, 1 - 0.28 * Math.max(0, a - 1.4));
        // Aplica tudo de uma vez no estilo do card.
        el.style.transform = `translate(-50%, -50%) translateX(${x}px) perspective(1200px) translateZ(${z}px) rotateY(${ry}deg) scale(${sc})`;
        el.style.opacity = String(op);
        // Quem está mais perto do centro fica por cima (z-index maior).
        el.style.zIndex = String(100 - Math.round(a * 10));
        // Desfoque leve nos cards distantes, reforçando a ideia de profundidade.
        el.style.filter = `blur(${Math.max(0, a - 1.2) * 1.6}px)`;
        // Brilho da borda (variável CSS --b usada no estilo da borda do link): mais forte no centro.
        el.style.setProperty("--b", String(Math.max(0.06, 0.4 - 0.3 * a)));
      });
      // Descobre qual peça real está em destaque (a lista é dobrada, então usa o resto por N) e
      // só atualiza o estado do React quando ela muda (evita redesenhar à toa).
      const idx = ((Math.round(s.target) % N) + N) % N;
      setActive((prev) => (prev === idx ? prev : idx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Ao sair da tela, cancela o laço (senão ele continuaria rodando sem necessidade).
    return () => cancelAnimationFrame(raf);
  }, [N, total]);

  // Roda do mouse: cada "giro" da roda avança ou volta um card. Registrado "na mão" (e não via
  // onWheel do React) porque precisa de { passive: false } para poder bloquear a rolagem da página
  // enquanto o mouse está sobre o arco.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Usa o movimento horizontal ou vertical, o que for maior (aceita touchpad e roda comum).
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Ignora movimentos minúsculos (evita trocar de card sem querer).
      if (Math.abs(d) > 30) state.current.target += d > 0 ? 1 : -1;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- Arrastar (mouse ou dedo) ----
  /** Começou a arrastar: guarda o ponto inicial e "captura" o ponteiro, para o arrasto continuar mesmo se sair do palco. */
  function down(e: React.PointerEvent) {
    const s = state.current;
    s.dragging = true;
    s.moved = false;
    s.x0 = e.clientX;
    s.p0 = s.pos;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  /** Arrastando: a posição acompanha o dedo (220px de arrasto = 1 card). */
  function move(e: React.PointerEvent) {
    const s = state.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.x0;
    // Só considera "arrasto de verdade" depois de 6px (clique tem tremida pequena).
    if (Math.abs(dx) > 6) s.moved = true;
    s.pos = s.p0 - dx / 220;
  }
  /** Soltou: o arco "assenta" no card mais próximo. */
  function up() {
    const s = state.current;
    s.dragging = false;
    s.target = Math.round(s.pos);
  }

  /** Setas ← e →: avança (+1) ou volta (-1) um card. */
  function step(dir: number) {
    state.current.target += dir;
  }

  return (
    <div className="relative">
      {/* O palco do arco: recebe os eventos de arrastar. touch-pan-y deixa o dedo rolar a página na
          vertical sem atrapalhar o arrasto na horizontal. select-none impede selecionar texto ao arrastar. */}
      <div
        ref={stageRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="relative h-[340px] w-full cursor-grab touch-pan-y select-none overflow-hidden active:cursor-grabbing"
      >
        {items.map((p, i) => (
          // Cada card começa no centro do palco; a posição real vem do laço de animação acima.
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="absolute left-1/2 top-1/2 w-[min(28vw,260px)] will-change-transform"
          >
            {/* O card é um link para a peça. Se o usuário acabou de ARRASTAR (state.moved), o clique
                que o navegador dispara ao soltar é cancelado, para arrastar não abrir a página sem querer. */}
            <Link
              href={`/loja/${p.slug}`}
              draggable={false}
              onClick={(e) => {
                if (state.current.moved) e.preventDefault();
              }}
              className="relative block overflow-hidden border border-[rgba(255,255,255,var(--b,0.2))] bg-gradient-to-b from-[#171718] to-[#0a0a0b] p-6"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 40px 80px -40px rgba(0,0,0,0.9)" }}
            >
              <div className="flex aspect-square items-center justify-center">
                <ProductImage product={p} sizes="260px" />
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <span className="text-lg font-medium text-foreground">{p.name}</span>
                <span className="text-base text-muted">{formatCents(p.priceCents)}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {/* Controles embaixo: seta para trás, "01 / 03" com o nome da peça em destaque, e seta para a frente. */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Peça anterior"
          onClick={() => step(-1)}
          className="h-11 w-11 border border-border text-foreground hover:bg-foreground hover:text-background"
        >
          ←
        </button>
        <span className="min-w-[14ch] text-center">
          <span className="block font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
            {String(active + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
          </span>
          {/* key={active}: ao mudar a peça, o React recria este texto e a animação de entrada
              (fade-in) toca de novo, dando um efeito suave na troca do nome. */}
          <span key={active} className="mt-1 block animate-[fade-in_0.5s_ease-out] text-base text-foreground">
            {products[active].name}
          </span>
        </span>
        <button
          type="button"
          aria-label="Próxima peça"
          onClick={() => step(1)}
          className="h-11 w-11 border border-border text-foreground hover:bg-foreground hover:text-background"
        >
          →
        </button>
      </div>
    </div>
  );
}
