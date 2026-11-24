// ============================================================================
// Página ENTRAR: /conta/entrar?next=/carrinho
//
// A ideia: um PROVADOR. À esquerda, o título gigante e a explicação; à direita, a porta do provador com
// o formulário (componente Provador). Quem já está logado nem vê a tela: vai direto ao destino.
//
// "next" é para onde voltar depois de entrar (a sacola, por exemplo). Vem da URL, então passa por safeNext
// aqui E de novo na ação: um link malicioso nunca leva a pessoa para outro site.
//
// Esta é a ÚNICA tela de entrada do site, para clientes e para quem administra a loja: não há botão nem link
// de "admin". O administrador digita o e-mail e a senha que recebeu e a ação de entrar o leva ao painel.
// "reentrar" aparece quando o login do administrador passou de 12 horas: a tela abre mesmo com a sessão
// ativa, e entrar de novo renova o horário do login.
// ============================================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Provador } from "@/components/conta/Provador";
import { currentCustomer, safeNext } from "@/server/customers/session";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

// Depende de quem está logado: lê o cookie a cada visita, sem casca estática.
export const instant = false;

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; reentrar?: string }> }) {
  const { next: bruto, reentrar } = await searchParams;
  const next = safeNext(Array.isArray(bruto) ? bruto[0] : bruto);
  // Já entrou? Não há por que mostrar a porta: segue para o destino (a não ser que o painel tenha pedido para
  // entrar de novo).
  if (!reentrar && (await currentCustomer())) redirect(next);

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-14 md:grid-cols-[1fr_30rem] md:items-start md:pt-20">
        <div className="flex flex-col gap-8">
          <h1 className="font-display text-[clamp(3.5rem,11vw,10rem)] uppercase leading-[0.86]">
            Prova
            <br />
            primeiro
          </h1>
          <p className="max-w-md text-xl font-medium">
            {reentrar
              ? "Por segurança, o acesso pede o login de novo a cada 12 horas. Entre outra vez para continuar."
              : "Entre na sua conta para fechar o pedido e acompanhar cada peça, do pagamento até a entrega."}
          </p>
        </div>
        <Provador next={next} />
      </div>
    </section>
  );
}
