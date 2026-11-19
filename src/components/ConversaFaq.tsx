// ============================================================================
// CONVERSA DE FAQ (página /faq): as perguntas frequentes apresentadas como uma conversa de WhatsApp.
//
// À esquerda, a lista de perguntas (botões). À direita, a "tela do chat": ao tocar numa pergunta,
// ela aparece como mensagem do cliente, surge o indicador "digitando..." por um instante, e então
// chega a resposta da loja. Cada pergunta só pode ser feita uma vez (fica marcada com ✓). Embaixo,
// um botão leva ao WhatsApp de verdade, para quem não achou a resposta.
//
// É componente de navegador porque controla a conversa (mensagens, "digitando", temporizador).
// As perguntas e o link do WhatsApp chegam prontos da página /faq.
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";

// Uma pergunta com a sua resposta.
type Item = { q: string; a: string };
// Uma mensagem do chat: de quem (o cliente ou a loja) e o texto.
type Msg = { de: "cliente" | "loja"; texto: string };

// As perguntas viram uma conversa: toca na pergunta, ela é "enviada" e a resposta chega logo depois.
export function ConversaFaq({ perguntas, whatsappHref }: { perguntas: Item[]; whatsappHref: string }) {
  // As mensagens já trocadas, na ordem em que aparecem.
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // true enquanto a loja está "digitando" a resposta (mostra os três pontinhos).
  const [digitando, setDigitando] = useState(false);
  // Índices das perguntas já feitas (cada uma só vale uma vez).
  const [feitas, setFeitas] = useState<number[]>([]);
  // A caixa de mensagens, para rolá-la até a última mensagem.
  const painel = useRef<HTMLDivElement>(null);
  // O temporizador da "digitação", guardado para poder cancelá-lo se o cliente sair da página.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpeza: se o componente sair da tela com a resposta ainda "sendo digitada", cancela o temporizador.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Sempre que chega mensagem nova (ou o "digitando" aparece), rola a caixa até o fim, suavemente.
  useEffect(() => {
    painel.current?.scrollTo({ top: painel.current.scrollHeight, behavior: "smooth" });
  }, [msgs, digitando]);

  /** O cliente tocou na pergunta número i: "envia" a pergunta e agenda a resposta. */
  function perguntar(i: number) {
    // Ignora se a pergunta já foi feita ou se a loja ainda está respondendo outra.
    if (feitas.includes(i) || digitando) return;
    setFeitas((f) => [...f, i]);
    setMsgs((m) => [...m, { de: "cliente", texto: perguntas[i].q }]);
    setDigitando(true);
    // Quem pediu menos movimento ao sistema recebe a resposta na hora, sem a pausa de "digitando".
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(() => {
      setDigitando(false);
      setMsgs((m) => [...m, { de: "loja", texto: perguntas[i].a }]);
    }, reduzido ? 0 : 900);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1fr_1fr] md:gap-16 md:py-20">
      {/* ESQUERDA: a lista de perguntas. A feita fica preenchida e com ✓; durante a "digitação" as
          outras ficam desabilitadas, para não atropelar a resposta. */}
      <ul className="flex flex-col">
        {perguntas.map((p, i) => {
          const feita = feitas.includes(i);
          return (
            <li key={p.q} className="border-t-2 border-foreground last:border-b-2">
              <button
                type="button"
                onClick={() => perguntar(i)}
                disabled={digitando && !feita}
                aria-pressed={feita}
                className={`grid w-full grid-cols-[3rem_1fr_auto] items-baseline gap-4 px-2 py-5 text-left font-display text-2xl uppercase leading-tight transition-colors md:text-3xl ${
                  feita ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"
                }`}
              >
                <span className="text-xl">{String(i + 1).padStart(2, "0")}</span>
                <span>{p.q}</span>
                <span aria-hidden="true" className="text-xl">{feita ? "✓" : "→"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* DIREITA: a "tela do chat" (fixa ao rolar, em telas largas). */}
      <div className="md:sticky md:top-24 md:self-start">
        {/* Barra de título do chat, como o topo de uma conversa. */}
        <div className="flex items-center justify-between border-2 border-foreground bg-foreground px-5 py-3 text-background">
          <span className="font-display text-2xl uppercase leading-none">DarkWear</span>
          <span className="font-mono text-xs uppercase tracking-[0.15em]">Respondemos aqui</span>
        </div>
        {/* Caixa de mensagens. aria-live="polite" faz leitores de tela anunciarem cada mensagem nova. */}
        <div
          ref={painel}
          aria-live="polite"
          className="flex h-[26rem] flex-col gap-4 overflow-y-auto border-x-2 border-b-2 border-foreground p-5 md:h-[30rem]"
        >
          {/* Instrução inicial, enquanto não há mensagens. */}
          {msgs.length === 0 && (
            <p className="m-auto max-w-xs text-center font-mono text-sm uppercase tracking-[0.15em]">
              Toque em uma pergunta para começar a conversa.
            </p>
          )}
          {/* Mensagens do cliente (à direita, preenchidas) e da loja (à esquerda, com borda), como num chat. */}
          {msgs.map((m, i) =>
            m.de === "cliente" ? (
              <p key={i} className="ml-auto max-w-[85%] bg-foreground px-4 py-3 text-lg font-bold text-background">
                {m.texto}
              </p>
            ) : (
              <p key={i} className="mr-auto max-w-[85%] border-2 border-foreground px-4 py-3 text-lg font-medium">
                {m.texto}
              </p>
            ),
          )}
          {/* "Digitando...": três quadradinhos que pulsam, cada um um pouco depois do anterior. */}
          {digitando && (
            <p className="mr-auto flex items-center gap-2 border-2 border-foreground px-4 py-4" aria-label="Digitando">
              {[0, 1, 2].map((n) => (
                <span key={n} className="h-2.5 w-2.5 animate-pulse bg-foreground" style={{ animationDelay: `${n * 180}ms` }} />
              ))}
            </p>
          )}
        </div>
        {/* Saída para o WhatsApp de verdade (abre em outra aba; noopener/noreferrer protegem a página de origem). */}
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-between border-2 border-foreground px-5 py-4 font-display text-2xl uppercase transition-colors hover:bg-foreground hover:text-background"
        >
          Não achou? Chama no WhatsApp
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}
