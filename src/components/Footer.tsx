import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { TypeBackdrop } from "@/components/TypeBackdrop";

const LINKS = [
  { href: "/loja", label: "Loja" },
  { href: "/personalizar", label: "Personalize" },
  { href: "/sobre", label: "Sobre" },
  { href: "/faq", label: "FAQ" },
  { href: "/contato", label: "Contato" },
];

export function Footer() {
  return (
    <footer className="relative">
      {/* Bloco preto: logo e links grandes */}
      <div className="relative isolate overflow-hidden bg-background">
        <TypeBackdrop text="Sob encomenda" rows={3} tone="dark" fade="top" size="clamp(6rem, 13vw, 13rem)" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col justify-between gap-6">
            {/* A logo ocupa a altura da lista de links, com o fundo da imagem invisível */}
            <div className="relative min-h-[16rem] flex-1">
              <Image
                src="/brand/logo-dark.jpg"
                alt="DarkWear"
                fill
                sizes="(min-width: 768px) 40vw, 90vw"
                className="origin-top-left -translate-x-[19%] scale-110 object-contain object-left-top mix-blend-screen"
              />
            </div>
            <p className="max-w-sm pb-3 font-display text-3xl uppercase leading-[1.05] text-foreground">Camisetas DTF. Pronta entrega e sob encomenda.</p>
          </div>

          <nav aria-label="Rodapé" className="flex flex-col">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group flex items-baseline justify-between gap-10 border-t border-border py-3 font-display text-5xl uppercase leading-none text-foreground transition-colors hover:text-muted md:text-6xl"
              >
                {l.label}
                <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-2">→</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mx-auto max-w-7xl border-t border-border px-6 py-5 text-sm text-muted">
          <p>© {SITE.name}. Todos os direitos reservados.</p>
        </div>
      </div>

      {/* Bloco branco: nome gigante cortado pela base da página */}
      <div className="overflow-hidden bg-foreground text-background">
        <p
          aria-hidden="true"
          className="pt-6 whitespace-nowrap text-center font-display uppercase leading-[0.76] text-background"
          style={{ fontSize: "clamp(5rem, 25vw, 24rem)", marginBottom: "-0.12em" }}
        >
          DarkWear
        </p>
      </div>
    </footer>
  );
}
