// ============================================================================
// Página CONTA: /conta
//
// A ideia: um CABIDE. Uma barra de arara no topo e, pendurada nela por um fio, cada coisa da conta numa
// etiqueta de papel: "Peça nº" (quem você é), "Senha", "Aparelhos", "Sair" e "Excluir". Em cada etiqueta
// só há UMA coisa para fazer, e o texto é sempre preto no papel branco (sem cinza fraco).
//
// Página privada: exige login (requireCustomer). Sem sessão, leva a /conta/entrar e volta para cá depois.
// ============================================================================

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExcluirContaForm, TrocarSenhaForm } from "@/components/conta/FormulariosDaConta";
import { logoutAction, signOutEverywhereAction } from "@/app/actions-cliente";
import { requireCustomer } from "@/server/customers/session";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

// Página privada de cada cliente: lê o cookie e o banco a cada visita, sem casca estática.
export const instant = false;

const dataBr = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

/** "11987654321" → "(11) 98765-4321" (e o fixo de 10 dígitos → "(11) 3333-4444"). */
function formatarCelular(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * Uma etiqueta pendurada na barra: um trecho da barra no topo, um fio curto e o papel branco embaixo.
 * Cada etiqueta traz o SEU trecho de barra, que se emenda com o do vizinho (a grade não tem espaço entre as
 * colunas): assim cada fila tem a sua própria arara e nenhuma etiqueta fica pendurada no vazio.
 * A barra, o fio e o furo são enfeite (aria-hidden); o conteúdo é só o que está dentro do papel.
 */
function Etiqueta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="relative flex flex-col items-center px-4 pb-6">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 block h-1.5 bg-foreground" />
      <span aria-hidden="true" className="mt-1.5 block h-8 w-0.5 bg-foreground" />
      <div className="relative w-full bg-foreground px-6 pb-7 pt-9 text-background">
        <span aria-hidden="true" className="absolute left-1/2 top-3 block h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-background" />
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">{titulo}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

const botao =
  "border-2 border-background bg-background px-5 py-3 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background";

export default async function ContaPage() {
  const c = await requireCustomer("/conta");

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-14 md:pt-20">
        <h1 className="font-display text-[clamp(3.5rem,11vw,10rem)] uppercase leading-[0.86]">
          Sua
          <br />
          conta
        </h1>

        {/* A arara: cada etiqueta traz o seu trecho de barra (ver Etiqueta acima). */}
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3">
          <Etiqueta titulo={`Peça nº ${String(c.id).padStart(5, "0")}`}>
            <p className="font-display text-4xl uppercase leading-none">{c.name}</p>
            <dl className="mt-4 flex flex-col gap-2 font-mono text-sm font-bold">
              <div>
                <dt className="text-xs uppercase tracking-[0.15em]">E-mail</dt>
                <dd className="break-all">{c.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.15em]">Celular</dt>
                <dd>{formatarCelular(c.phone)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.15em]">Cliente desde</dt>
                <dd>{dataBr.format(c.createdAt)}</dd>
              </div>
            </dl>
          </Etiqueta>

          <Etiqueta titulo="Senha">
            <TrocarSenhaForm />
          </Etiqueta>

          <Etiqueta titulo="Aparelhos">
            <p className="text-base font-medium">
              Entrou num computador que não é seu? Saia de todos os aparelhos de uma vez. Este continua com a sessão aberta.
            </p>
            <form action={signOutEverywhereAction} className="mt-5">
              <button type="submit" className={botao}>
                Sair de todos os outros
              </button>
            </form>
          </Etiqueta>

          <Etiqueta titulo="Sair">
            <p className="text-base font-medium">Encerra a sessão neste aparelho.</p>
            <form action={logoutAction} className="mt-5">
              <button type="submit" className={botao}>
                Sair da conta
              </button>
            </form>
          </Etiqueta>

          <Etiqueta titulo="Excluir">
            {/* O formulário só aparece depois de abrir: excluir não pode ser um clique sem querer. */}
            <details>
              <summary className="cursor-pointer text-base font-bold underline underline-offset-4">Quero excluir a minha conta</summary>
              <div className="mt-5">
                <ExcluirContaForm />
              </div>
            </details>
          </Etiqueta>
        </div>
      </div>
    </section>
  );
}
