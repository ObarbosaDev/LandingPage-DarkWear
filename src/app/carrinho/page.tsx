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

  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <p className="eyebrow">Sacola</p>
      <h1 className="mb-10 text-4xl font-black uppercase tracking-tight">Carrinho</h1>

      {!ready ? (
        <p className="text-muted">Carregando…</p>
      ) : items.length === 0 ? (
        <div className="border border-border p-10 text-center">
          <p className="text-muted">Seu carrinho está vazio.</p>
          <Link href="/loja" className="mt-6 inline-block bg-foreground px-8 py-3 text-sm font-bold uppercase tracking-widest text-background">
            Ir para a loja
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <ul className="divide-y divide-border border-y border-border">
            {items.map((i) => (
              <li key={i.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold uppercase">{i.name}</p>
                  <p className="text-sm text-muted">
                    {i.color} · tamanho {i.size} · {formatBRL(i.price)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-border">
                    <button type="button" onClick={() => setQty(i.id, i.qty - 1)} className="h-9 w-9 hover:bg-surface" aria-label="Diminuir">−</button>
                    <span className="w-10 text-center text-sm font-bold">{i.qty}</span>
                    <button type="button" onClick={() => setQty(i.id, i.qty + 1)} disabled={i.qty >= i.max} className="h-9 w-9 hover:bg-surface disabled:opacity-30" aria-label="Aumentar">+</button>
                  </div>
                  <p className="w-24 text-right font-semibold">{formatBRL(i.price * i.qty)}</p>
                  <button type="button" onClick={() => remove(i.id)} className="text-xs uppercase tracking-widest text-muted hover:text-foreground">
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-lg">
            <span className="uppercase tracking-widest text-muted">Total</span>
            <span className="text-2xl font-black">{formatBRL(total)}</span>
          </div>

          <button
            type="button"
            onClick={finalizar}
            disabled={status === "loading"}
            className="bg-foreground py-4 text-sm font-bold uppercase tracking-widest text-background hover:opacity-85 disabled:opacity-40"
          >
            {status === "loading" ? "Registrando pedido…" : "Finalizar pelo WhatsApp"}
          </button>
          {status === "error" && <p className="text-sm text-red-400">{error}</p>}
          <p className="text-center text-xs text-muted">{SITE.paymentNote}</p>
        </div>
      )}
    </section>
  );
}
