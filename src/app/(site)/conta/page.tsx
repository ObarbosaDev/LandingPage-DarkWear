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
import Link from "next/link";
import { Arara, Etiqueta } from "@/components/conta/Arara";
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

const botao =
  "border-2 border-background bg-background px-5 py-3 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background";

export default async function ContaPage() {
  // permitirSenhaProvisoria: é a única página que abre para quem entrou com senha provisória, para ele poder trocá-la.
  const c = await requireCustomer("/conta", { permitirSenhaProvisoria: true });

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-14 md:pt-20">
        <h1 className="font-display text-[clamp(3.5rem,11vw,10rem)] uppercase leading-[0.86]">
          Sua
          <br />
          conta
        </h1>

        {/* Senha provisória (gerada pelo painel ou pelo comando do dono): enquanto não for trocada, o resto fica fechado. */}
        {c.mustChangePassword && (
          <p role="alert" className="mt-8 max-w-2xl border-2 border-foreground p-4 text-lg font-bold">
            Você entrou com uma senha provisória. Troque-a na etiqueta “Senha” abaixo para liberar o resto da conta.
          </p>
        )}

        {/* A arara: cada etiqueta traz o seu trecho de barra (ver components/conta/Arara.tsx). */}
        <Arara>
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

          <Etiqueta titulo="Pedidos">
            <p className="text-base font-medium">Acompanhe cada peça, do pagamento até a entrega.</p>
            <Link href="/conta/pedidos" className={`${botao} mt-5 inline-block`}>
              Meus pedidos
            </Link>
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
        </Arara>
      </div>
    </section>
  );
}
