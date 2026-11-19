"use client";

import { useState } from "react";

type Assunto = { id: string; rotulo: string; texto: string };

// Uma folha branca para escrever a mensagem em letra gigante. O que está escrito é o que vai para o WhatsApp.
export function Compositor({ assuntos, numero }: { assuntos: Assunto[]; numero: string }) {
  const [ativo, setAtivo] = useState(assuntos[0].id);
  const [texto, setTexto] = useState(assuntos[0].texto);
  const MAX = 400;

  function escolher(a: Assunto) {
    setAtivo(a.id);
    setTexto(a.texto);
  }

  const href = `https://wa.me/${numero}?text=${encodeURIComponent(texto.trim())}`;
  const vazio = texto.trim().length === 0;

  return (
    <section className="bg-foreground text-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[14rem_1fr] md:py-20">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.15em]">Sobre o quê?</p>
          <div className="mt-4 flex flex-wrap gap-2 md:flex-col">
            {assuntos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => escolher(a)}
                aria-pressed={ativo === a.id}
                className={`border-2 border-background px-4 py-3 text-left font-display text-2xl uppercase leading-none transition-colors ${
                  ativo === a.id ? "bg-background text-foreground" : "hover:bg-background hover:text-foreground"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <label htmlFor="mensagem" className="font-mono text-sm uppercase tracking-[0.15em]">
            Sua mensagem
          </label>
          <textarea
            id="mensagem"
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
            rows={5}
            className="w-full resize-none border-0 border-b-4 border-background bg-transparent pb-4 font-display text-[clamp(2rem,5.5vw,5rem)] uppercase leading-[1.02] text-background outline-none"
          />
          <p className="self-end font-mono text-sm uppercase tracking-[0.15em]">
            {texto.length}/{MAX}
          </p>
        </div>
      </div>

      <a
        href={vazio ? undefined : href}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={vazio}
        className={`group block bg-background text-foreground transition-colors ${
          vazio ? "cursor-not-allowed" : "hover:bg-foreground hover:text-background"
        }`}
      >
        <span className="mx-auto flex max-w-7xl items-center justify-between gap-6 border-y-2 border-foreground px-6 py-10 font-display text-[clamp(2.5rem,8vw,7rem)] uppercase leading-none md:py-14">
          {vazio ? "Escreva algo" : "Enviar no WhatsApp"}
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-3">→</span>
        </span>
      </a>
    </section>
  );
}
