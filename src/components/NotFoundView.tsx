import Link from "next/link";

// Tela de "não encontrado": usada na página 404 do site e nas peças que não existem ou estão ocultas.
export function NotFoundView() {
  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-center gap-8 px-6 py-16">
        <p className="font-mono text-sm uppercase tracking-[0.15em]">Erro 404</p>
        <h1 className="font-display text-[clamp(5rem,18vw,17rem)] uppercase leading-[1]">Não achei</h1>
        <p className="max-w-md text-xl font-medium">
          Essa página não existe, ou a peça saiu da loja. Volte para o início ou veja o que está em estoque.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="border-2 border-foreground bg-foreground px-7 py-3 font-display text-xl uppercase tracking-wide text-background transition-colors hover:bg-transparent hover:text-foreground"
          >
            Ir para o início
          </Link>
          <Link
            href="/loja"
            className="border-2 border-foreground px-7 py-3 font-display text-xl uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background"
          >
            Ver a loja
          </Link>
        </div>
      </div>
    </section>
  );
}
