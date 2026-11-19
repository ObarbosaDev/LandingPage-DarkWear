"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/product";
import { ProductImage } from "@/components/ProductImage";
import { formatCents } from "@/lib/money";

// Arco de cards de vidro: arrastar, rolar, setas ou clique trocam a peça em destaque.
export function ProductArc({ products }: { products: Product[] }) {
  const N = products.length;
  // Repete a lista para o arco parecer contínuo nas duas pontas.
  const items = [...products, ...products];
  const total = items.length;

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const state = useRef({ pos: 0, target: 0, dragging: false, x0: 0, p0: 0, moved: false });
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = state.current;
      if (!s.dragging) s.pos += (s.target - s.pos) * 0.12;
      const stage = stageRef.current;
      const W = stage ? stage.clientWidth : 1000;
      const cardW = Math.min(W * 0.28, 260);
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const u = ((i - s.pos + total / 2) % total + total) % total - total / 2;
        const a = Math.abs(u);
        const sg = Math.sign(u) || 1;
        const x = sg * a * cardW * 0.98;
        const sc = Math.max(0.6, 1.08 - 0.2 * Math.min(a, 1) - 0.12 * Math.max(0, a - 1));
        const z = -120 * Math.max(0, a);
        const ry = -sg * Math.min(35, 14 + 8 * a);
        const op = Math.max(0, 1 - 0.28 * Math.max(0, a - 1.4));
        el.style.transform = `translate(-50%, -50%) translateX(${x}px) perspective(1200px) translateZ(${z}px) rotateY(${ry}deg) scale(${sc})`;
        el.style.opacity = String(op);
        el.style.zIndex = String(100 - Math.round(a * 10));
        el.style.filter = `blur(${Math.max(0, a - 1.2) * 1.6}px)`;
        el.style.setProperty("--b", String(Math.max(0.06, 0.4 - 0.3 * a)));
      });
      const idx = ((Math.round(s.target) % N) + N) % N;
      setActive((prev) => (prev === idx ? prev : idx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [N, total]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) > 30) state.current.target += d > 0 ? 1 : -1;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function down(e: React.PointerEvent) {
    const s = state.current;
    s.dragging = true;
    s.moved = false;
    s.x0 = e.clientX;
    s.p0 = s.pos;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const s = state.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.x0;
    if (Math.abs(dx) > 6) s.moved = true;
    s.pos = s.p0 - dx / 220;
  }
  function up() {
    const s = state.current;
    s.dragging = false;
    s.target = Math.round(s.pos);
  }

  function step(dir: number) {
    state.current.target += dir;
  }

  return (
    <div className="relative">
      <div
        ref={stageRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="relative h-[340px] w-full cursor-grab touch-pan-y select-none overflow-hidden active:cursor-grabbing"
      >
        {items.map((p, i) => (
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="absolute left-1/2 top-1/2 w-[min(28vw,260px)] will-change-transform"
          >
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
