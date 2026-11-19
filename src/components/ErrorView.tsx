"use client";

import Link from "next/link";
import { useEffect } from "react";

// Tela de erro inesperado, com "tentar de novo". Serve ao site e ao painel (muda só o link de saída).
export function ErrorView({
  error,
  reset,
  saida = { href: "/", rotulo: "Ir para o início" },
}: {
  error: Error & { digest?: string };
  reset: () => void;
  saida?: { href: string; rotulo: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-center gap-8 px-6 py-16">
        <p className="font-mono text-sm uppercase tracking-[0.15em]">Algo deu errado</p>
        <h1 className="font-display text-[clamp(4rem,14vw,13rem)] uppercase leading-[1]">Deu ruim</h1>
        <p className="max-w-md text-xl font-medium">
          Não foi possível carregar esta página agora. Tente de novo. Se continuar, chame a gente no WhatsApp.
        </p>
        {error.digest ? <p className="font-mono text-sm">Código: {error.digest}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="border-2 border-foreground bg-foreground px-7 py-3 font-display text-xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground"
          >
            Tentar de novo
          </button>
          <Link
            href={saida.href}
            className="border-2 border-foreground px-7 py-3 font-display text-xl uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
          >
            {saida.rotulo}
          </Link>
        </div>
      </div>
    </section>
  );
}
