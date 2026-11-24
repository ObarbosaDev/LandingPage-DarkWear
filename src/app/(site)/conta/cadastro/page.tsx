// ============================================================================
// Página CADASTRO: /conta/cadastro?next=/carrinho
//
// A ideia: uma ETIQUETA de camiseta (componente Etiqueta): os campos são as linhas da etiqueta e, ao lado,
// as "instruções de cuidado" explicam o que acontece com os dados. Quem já está logado vai direto ao destino.
// ============================================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Etiqueta } from "@/components/conta/Etiqueta";
import { currentCustomer, destinoDaUrl } from "@/server/customers/session";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false } };

// Depende de quem está logado: lê o cookie a cada visita, sem casca estática.
export const instant = false;

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next: bruto } = await searchParams;
  const next = destinoDaUrl(bruto);
  if (await currentCustomer()) redirect(next || "/conta");

  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-14 md:pt-20">
        <h1 className="font-display text-[clamp(3.5rem,11vw,10rem)] uppercase leading-[0.86]">
          Sua
          <br />
          etiqueta
        </h1>
        <p className="mt-6 max-w-xl text-xl font-medium">
          Uma conta por pessoa. Leva um minuto e deixa o pedido guardado no seu nome.
        </p>
        <div className="mt-10">
          <Etiqueta next={next} />
        </div>
      </div>
    </section>
  );
}
