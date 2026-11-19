"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { formatBRL, SITE } from "@/lib/site";

export default function CarrinhoPage() {
  const { items, total, setQty, remove, clear, ready } = useCart();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function finalizar() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ slug: i.slug, size: i.size, color: i.color, qty: i.qty })),
        }),
      });
      const data = (await res.json()) as { whatsappUrl?: string; error?: string };
      if (!res.ok || !data.whatsappUrl) throw new Error(data.error ?? "Não foi possível registrar o pedido.");
      clear();
      window.location.href = data.whatsappUrl;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    }
  }

  const pecas = items.reduce((n, i) => n + i.qty, 0);
  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const step =
    "h-9 w-9 border-2 border-background text-lg font-bold transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed";

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-14 md:grid-cols-[1fr_30rem] md:items-start md:pt-20">
        <div className="flex flex-col gap-8">
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(4rem,12vw,11rem)] uppercase leading-[0.86]">
            Sua
            <br />
            sacola
          </h1>
          <p className="max-w-sm text-xl font-medium">
            {ready && pecas > 0
              ? `${pecas} ${pecas === 1 ? "peça" : "peças"} no pedido. Confira, ajuste as quantidades e feche pelo WhatsApp.`
              : "Escolha as peças na loja e elas aparecem aqui."}
          </p>
          <Link
            href="/loja"
            className="self-start border-2 border-foreground px-6 py-3 font-[family-name:var(--font-display)] text-xl uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
          >
            Continuar comprando
          </Link>
        </div>

        {/* O recibo: papel branco, fonte de máquina, pontilhado entre o item e o preço. */}
        <div className="md:sticky md:top-24">
          <div className="bg-foreground px-6 pb-8 pt-7 font-mono text-background">
            <div className="flex items-baseline justify-between border-b-2 border-dashed border-background pb-4">
              <span className="font-[family-name:var(--font-display)] text-3xl uppercase leading-none">{SITE.name}</span>
              <span className="text-sm uppercase tracking-[0.12em]">Pedido · {hoje}</span>
            </div>

            {!ready ? (
              <p className="py-8 text-base">Carregando…</p>
            ) : items.length === 0 ? (
              <p className="py-10 font-[family-name:var(--font-display)] text-4xl uppercase leading-none">
                Nenhuma peça ainda.
              </p>
            ) : (
              <ul className="divide-y-2 divide-dashed divide-background">
                {items.map((i) => (
                  <li key={i.id} className="py-4">
                    <div className="flex items-end gap-2 text-base font-bold uppercase">
                      <span>
                        {i.qty}x {i.name}
                      </span>
                      <span aria-hidden="true" className="mb-1 flex-1 border-b-2 border-dotted border-background" />
                      <span>{formatBRL(i.price * i.qty)}</span>
                    </div>
                    <p className="mt-1 text-sm uppercase tracking-[0.08em]">
                      {i.color} · tam. {i.size} · {formatBRL(i.price)} cada
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setQty(i.id, i.qty - 1)} className={step} aria-label="Diminuir">
                          −
                        </button>
                        <span className="w-8 text-center text-lg font-bold">{i.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(i.id, i.qty + 1)}
                          disabled={i.qty >= i.max}
                          className={step}
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                      <button type="button" onClick={() => remove(i.id)} className="text-sm font-bold uppercase underline underline-offset-4">
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {ready && items.length > 0 && (
              <>
                <div className="mt-2 flex items-end justify-between border-t-2 border-dashed border-background pt-5">
                  <span className="text-sm font-bold uppercase tracking-[0.15em]">Total</span>
                  <span className="font-[family-name:var(--font-display)] text-6xl leading-none">{formatBRL(total)}</span>
                </div>
                <button
                  type="button"
                  onClick={finalizar}
                  disabled={status === "loading"}
                  className="mt-6 w-full border-2 border-background bg-background px-6 py-4 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait"
                >
                  {status === "loading" ? "Registrando pedido…" : "Finalizar pelo WhatsApp"}
                </button>
                {status === "error" && <p role="alert" className="mt-4 border-2 border-background p-3 text-base font-bold">{error}</p>}
                <p className="mt-4 text-sm">{SITE.paymentNote}</p>
              </>
            )}
          </div>
          {/* Borda serrilhada de recibo */}
          <div
            aria-hidden="true"
            className="h-3 w-full"
            style={{
              background:
                "linear-gradient(135deg, var(--foreground) 50%, transparent 50%) 0 0 / 16px 12px, linear-gradient(225deg, var(--foreground) 50%, transparent 50%) 0 0 / 16px 12px",
              backgroundRepeat: "repeat-x",
            }}
          />
        </div>
      </div>
    </section>
  );
}
