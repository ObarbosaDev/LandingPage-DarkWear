// ============================================================================
// Página da SACOLA: /carrinho. Aqui o cliente revisa as peças e fecha o pedido pelo WhatsApp.
//
// Visual: a sacola é um "recibo de papel" (fonte de máquina, pontilhado entre o item e o preço, borda
// serrilhada). À esquerda, o título e um atalho para continuar comprando.
//
// Comprar exige conta: sem login, o botão leva a /conta/entrar e volta para cá com a sacola intacta.
// Dois jeitos de fechar:
//   - "Pagar com cartão ou Pix" (só aparece se o Mercado Pago estiver configurado): o cliente é levado
//     à página de pagamento do Mercado Pago. Os dados do cartão NUNCA passam por este site;
//   - "Finalizar pelo WhatsApp": o pedido vai para a conversa, como antes.
// Nos dois, o fluxo é o mesmo até o fim:
//   1. envia ao servidor SÓ quais peças, tamanhos, cores e quantidades (POST /api/orders);
//   2. o servidor confere o estoque, recalcula os preços e registra o pedido;
//   3. a sacola é esvaziada e o cliente é levado ao destino (pagamento ou WhatsApp).
// Os preços mostrados aqui servem só para exibição: quem manda é o servidor.
//
// É componente de navegador ("use client") porque lê o carrinho guardado no navegador (useCart).
// ============================================================================

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { SITE } from "@/lib/site";
import { formatCents } from "@/lib/money";

export default function CarrinhoPage() {
  const router = useRouter();
  const { items, totalCents, setQty, remove, clear, ready } = useCart();
  // Situação do botão "Finalizar": parado, enviando, ou deu erro (com a mensagem em "error").
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  // Se o pagamento online está disponível (o servidor diz). Começa falso: o botão só aparece depois.
  const [online, setOnline] = useState(false);
  useEffect(() => {
    fetch("/api/payments/config")
      .then((r) => r.json())
      .then((d: { online?: boolean }) => setOnline(d.online === true))
      .catch(() => setOnline(false)); // sem resposta, fica só o WhatsApp
  }, []);

  /** Registra o pedido no servidor e leva o cliente ao pagamento (modo "online") ou ao WhatsApp. */
  async function finalizar(modo: "whatsapp" | "online") {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Só o essencial: o servidor ignora qualquer preço e busca os valores reais no banco.
        body: JSON.stringify({
          items: items.map((i) => ({ slug: i.slug, size: i.size, color: i.color, qty: i.qty })),
          payment: modo,
        }),
      });
      // Comprar exige conta: sem sessão o servidor responde 401. Leva a pessoa a entrar (ou cadastrar) e
      // ela volta para esta sacola, com os itens intactos (o carrinho só é esvaziado quando o pedido é feito).
      if (res.status === 401) {
        setStatus("idle");
        router.push("/conta/entrar?next=%2Fcarrinho");
        return;
      }
      const data = (await res.json()) as { whatsappUrl?: string; paymentUrl?: string; error?: string; code?: string };
      // Falta o endereço de entrega: leva à conta, direto na etiqueta "Entrega". A sacola continua intacta.
      if (res.status === 422 && data.code === "sem-endereco") {
        setStatus("idle");
        router.push("/conta?endereco=1#endereco");
        return;
      }
      const destino = modo === "online" ? data.paymentUrl : data.whatsappUrl;
      // Falhou (sem estoque, muitas tentativas...): mostra a mensagem que o servidor mandou.
      if (!res.ok || !destino) throw new Error(data.error ?? "Não foi possível registrar o pedido.");
      // Pedido registrado: esvazia a sacola e leva o cliente ao destino.
      clear();
      window.location.href = destino;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    }
  }

  // Total de peças (soma das quantidades), para o texto "3 peças no pedido".
  const pecas = items.reduce((n, i) => n + i.qty, 0);
  // Estilo dos botões − e + de quantidade.
  const step =
    "h-9 w-9 border-2 border-background text-lg font-bold transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed";

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-14 md:grid-cols-[1fr_30rem] md:items-start md:pt-20">
        {/* Coluna da esquerda: título, resumo em uma frase e atalho de volta à loja. */}
        <div className="flex flex-col gap-8">
          <h1 className="font-display text-[clamp(4rem,12vw,11rem)] uppercase leading-[0.86]">
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
            className="self-start border-2 border-foreground px-6 py-3 font-display text-xl uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
          >
            Continuar comprando
          </Link>
        </div>

        {/* O recibo: papel branco, fonte de máquina, pontilhado entre o item e o preço. */}
        <div className="md:sticky md:top-24">
          <div className="bg-foreground px-6 pb-8 pt-7 font-mono text-background">
            <div className="flex items-baseline justify-between border-b-2 border-dashed border-background pb-4">
              <span className="font-display text-3xl uppercase leading-none">{SITE.name}</span>
              <span className="text-sm uppercase tracking-[0.12em]">Pedido</span>
            </div>

            {/* Três situações: ainda lendo o navegador, sacola vazia, ou lista de itens. */}
            {!ready ? (
              <p className="py-8 text-base">Carregando…</p>
            ) : items.length === 0 ? (
              <p className="py-10 font-display text-4xl uppercase leading-none">
                Nenhuma peça ainda.
              </p>
            ) : (
              <ul className="divide-y-2 divide-dashed divide-background">
                {items.map((i) => (
                  <li key={i.id} className="py-4">
                    {/* Linha principal: "2x Peça ........ R$ valor". O pontilhado é uma linha que
                        ocupa o espaço entre o nome e o preço (flex-1). */}
                    <div className="flex items-end gap-2 text-base font-bold uppercase">
                      <span>
                        {i.qty}x {i.name}
                      </span>
                      <span aria-hidden="true" className="mb-1 flex-1 border-b-2 border-dotted border-background" />
                      <span>{formatCents(i.priceCents * i.qty)}</span>
                    </div>
                    <p className="mt-1 text-sm uppercase tracking-[0.08em]">
                      {i.color} · tam. {i.size} · {formatCents(i.priceCents)} cada
                    </p>
                    {/* Controles da linha: − quantidade + e "Remover". O + é desabilitado ao
                        atingir o estoque conhecido da peça (i.max). */}
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

            {/* Total e botão de finalizar: só aparecem se há itens. */}
            {ready && items.length > 0 && (
              <>
                <div className="mt-2 flex items-end justify-between border-t-2 border-dashed border-background pt-5">
                  <span className="text-sm font-bold uppercase tracking-[0.15em]">Total</span>
                  <span className="font-display text-6xl leading-none">{formatCents(totalCents)}</span>
                </div>
                {/* Pagar online: cartão de crédito, débito ou Pix, na página do Mercado Pago. */}
                {online && (
                  <button
                    type="button"
                    onClick={() => finalizar("online")}
                    disabled={status === "loading"}
                    className="mt-6 w-full border-2 border-background bg-background px-6 py-4 font-display text-2xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait"
                  >
                    {status === "loading" ? "Registrando pedido…" : "Pagar com cartão ou Pix"}
                  </button>
                )}
                {/* O WhatsApp é o botão principal quando não há pagamento online; com ele, vira a alternativa. */}
                <button
                  type="button"
                  onClick={() => finalizar("whatsapp")}
                  disabled={status === "loading"}
                  className={
                    online
                      ? "mt-3 w-full border-2 border-background px-6 py-3 font-display text-xl uppercase tracking-wide transition-colors hover:bg-background hover:text-foreground disabled:cursor-wait"
                      : "mt-6 w-full border-2 border-background bg-background px-6 py-4 font-display text-2xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait"
                  }
                >
                  {status === "loading" ? "Registrando pedido…" : "Finalizar pelo WhatsApp"}
                </button>
                {/* Erro do servidor (ex.: "Estoque insuficiente para ..."). */}
                {status === "error" && <p role="alert" className="mt-4 border-2 border-background p-3 text-base font-bold">{error}</p>}
                <p className="mt-4 text-sm">{SITE.paymentNote}</p>
              </>
            )}
          </div>
          {/* Borda serrilhada de recibo */}
          {/* Faixa de pontas triangulares sob o recibo, feita com dois degradês que se repetem
              na horizontal (não há imagem). Só enfeite, por isso aria-hidden. */}
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
