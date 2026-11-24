// ============================================================================
// PROVADOR: a tela de ENTRAR (/conta/entrar), feita como a porta de um provador de loja.
//
// A ideia: o palco é uma cortina preta pregueada e, no meio, uma porta branca de provador com a plaquinha
// "PROVADOR 01 · LIVRE" e o formulário. Ao enviar, a porta se abre (animação curta, só para quem não
// pediu "reduzir movimento"); se der erro, ela volta a fechar e a mensagem aparece na própria porta.
//
// Quem usa: src/app/(site)/conta/entrar/page.tsx. O formulário chama loginAction (src/app/actions-cliente.ts).
//
// A DOBRADIÇA: a porta tem três pequenas dobradiças na borda esquerda. A do meio é o acesso escondido ao
// painel do dono: segurar o clique nela por 2 segundos leva a /admin/login. Não tem texto, nem rótulo, nem
// aparência de botão (parece uma dobradiça, e é uma). Isto é só DISCRIÇÃO: quem protege o painel é a
// senha e o limite de tentativas, nunca o segredo de onde fica a porta.
// ============================================================================

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef } from "react";
import { loginAction, type ClienteFormState } from "@/app/actions-cliente";

// Rótulo pequeno em fonte mono e o campo (só uma linha embaixo, que inverte ao receber o foco).
const rotulo = "font-mono text-xs font-bold uppercase tracking-[0.18em]";
const campo =
  "w-full border-0 border-b-2 border-background bg-transparent py-2 font-mono text-lg text-background outline-none transition-colors focus:bg-background focus:px-2 focus:text-foreground";

// Quanto tempo segurar a dobradiça (milissegundos).
const SEGURAR_MS = 2000;

export function Provador({ next }: { next: string }) {
  const router = useRouter();
  const [estado, acao, pending] = useActionState<ClienteFormState, FormData>(loginAction, {});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Começa a contar quando o dedo/mouse aperta a dobradiça; se soltar ou sair antes do tempo, cancela.
  const apertou = () => {
    timer.current = setTimeout(() => router.push("/admin/login"), SEGURAR_MS);
  };
  const soltou = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Uma dobradiça: uma barrinha preta na borda da porta. O onContextMenu da do meio (abaixo) bloqueia o
  // menu que celulares abrem ao segurar, só nesta peça.
  const dobradica = "block h-8 w-2 bg-background touch-none select-none";

  return (
    // O palco: cortina preta com pregas (listras verticais bem sutis). overflow-hidden segura a porta
    // aberta dentro do palco durante a animação.
    <div
      className="relative overflow-hidden border-2 border-foreground p-6 sm:p-10"
      style={{ background: "repeating-linear-gradient(90deg, #000 0 14px, #161616 14px 16px)" }}
    >
      {/* A porta. Ao enviar (pending), gira na borda esquerda, como uma porta abrindo. */}
      <div
        className={`relative bg-foreground py-8 pl-9 pr-6 text-background shadow-[0_0_0_2px_#fff] transition-transform duration-500 ease-in-out [transform-origin:left_center] motion-safe:[transform:perspective(1100px)_rotateY(0deg)] ${
          pending ? "motion-safe:[transform:perspective(1100px)_rotateY(-62deg)]" : ""
        }`}
      >
        {/* Dobradiças na borda esquerda. A do meio é o acesso escondido (ver o topo do arquivo). */}
        <div aria-hidden="true" className="absolute inset-y-0 left-1.5 flex w-2 flex-col items-center justify-around py-8">
          <span className={dobradica} />
          <span
            className={`${dobradica} cursor-default`}
            onPointerDown={apertou}
            onPointerUp={soltou}
            onPointerLeave={soltou}
            onPointerCancel={soltou}
            onContextMenu={(e) => e.preventDefault()}
          />
          <span className={dobradica} />
        </div>

        {/* A plaquinha da porta. */}
        <p className="inline-block border-2 border-background px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em]">
          Provador 01 · Livre
        </p>
        <h2 className="mt-4 font-display text-5xl uppercase leading-[0.9]">Entrar</h2>

        <form action={acao} className="mt-6 flex flex-col gap-6">
          {/* Para onde voltar depois de entrar (a sacola, por exemplo). Já vem conferido pela página. */}
          <input type="hidden" name="next" value={next} />

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className={rotulo}>E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              defaultValue={estado.values?.email ?? ""}
              className={campo}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className={rotulo}>Senha</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" maxLength={128} className={campo} />
          </div>

          {/* Erro do servidor (a mensagem é a mesma para senha errada e e-mail inexistente). */}
          {estado.error ? (
            <p role="alert" className="border-2 border-background p-3 text-base font-bold">
              {estado.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="border-2 border-background bg-background px-6 py-4 font-display text-2xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait"
          >
            {pending ? "Abrindo…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-base font-medium">
          Ainda não tem conta?{" "}
          <Link href={`/conta/cadastro?next=${encodeURIComponent(next)}`} className="font-bold underline underline-offset-4">
            Criar a minha
          </Link>
        </p>
      </div>
    </div>
  );
}
