"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { formatBRL, SITE } from "@/lib/site";
import { PageHero } from "@/components/PageHero";

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

  const btnPrimary =
    "border-2 border-background bg-background px-8 py-5 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait";

  return (
    <>
      <PageHero word="Pedido" title="Sacola" />

      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-5xl px-6 py-16">
          {!ready ? (
            <p className="text-xl font-medium">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-start gap-8">
              <p className="font-[family-name:var(--font-display)] text-5xl uppercase leading-none md:text-7xl">
                Sua sacola está vazia.
              </p>
              <Link href="/loja" className={btnPrimary}>
                Ver peças
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-10">
              <ul className="border-b-2 border-background">
                {items.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-col gap-5 border-t-2 border-background py-6 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-[family-name:var(--font-display)] text-4xl uppercase leading-none">{i.name}</p>
                      <p className="mt-2 text-lg font-medium">
                        {i.color} · tamanho {i.size} · {formatBRL(i.price)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-5">
                      <div className="flex items-center border-2 border-background">
                        <button
                          type="button"
                          onClick={() => setQty(i.id, i.qty - 1)}
                          className="h-11 w-11 text-xl transition-colors hover:bg-background hover:text-foreground"
                          aria-label="Diminuir"
                        >
                          −
                        </button>
                        <span className="w-12 text-center text-lg font-bold">{i.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(i.id, i.qty + 1)}
                          disabled={i.qty >= i.max}
                          className="h-11 w-11 text-xl transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed"
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                      <p className="w-28 text-right font-[family-name:var(--font-display)] text-3xl leading-none">
                        {formatBRL(i.price * i.qty)}
                      </p>
                      <button
                        type="button"
                        onClick={() => remove(i.id)}
                        className="text-lg font-medium underline underline-offset-4"
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex items-end justify-between gap-6">
                <span className="font-mono text-sm uppercase tracking-[0.15em]">Total</span>
                <span className="font-[family-name:var(--font-display)] text-6xl leading-none md:text-8xl">{formatBRL(total)}</span>
              </div>

              <button type="button" onClick={finalizar} disabled={status === "loading"} className={btnPrimary}>
                {status === "loading" ? "Registrando pedido…" : "Finalizar pelo WhatsApp"}
              </button>
              {status === "error" && (
                <p className="border-2 border-background p-4 text-lg font-bold">{error}</p>
              )}
              <p className="text-lg font-medium">{SITE.paymentNote}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
