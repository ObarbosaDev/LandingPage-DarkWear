// ============================================================================
// CABEÇALHO do site: a barra fixa no topo de todas as páginas da loja.
//
// Tem, da esquerda para a direita: a logo (leva à home), os links de navegação (só em telas largas),
// a busca de peças, o ícone da sacola com o número de peças e, no celular, o botão "Menu".
// Embaixo da barra há uma linha fina que mostra o PROGRESSO da rolagem da página.
//
// É componente de navegador ("use client") porque reage à rolagem, ao endereço atual, ao carrinho e
// ao abrir/fechar do menu e da busca.
// ============================================================================

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "@/lib/cart";

// Os links do menu, na ordem em que aparecem (o número 01, 02... mostrado ao lado vem da posição).
const NAV = [
  { href: "/", label: "Início" },
  { href: "/loja", label: "Loja" },
  { href: "/personalizar", label: "Personalize" },
  { href: "/sobre", label: "Sobre" },
  { href: "/faq", label: "FAQ" },
  { href: "/contato", label: "Contato" },
];

export function Header() {
  const router = useRouter();
  // Endereço atual, para destacar no menu a página em que o cliente está.
  const pathname = usePathname();
  // count = peças na sacola (o numerinho); ready = já leu o carrinho salvo no navegador.
  const { count, ready } = useCart();
  // Menu do celular aberto ou fechado.
  const [open, setOpen] = useState(false);
  // Campo de busca visível ou só o ícone da lupa; e o texto digitado.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // true depois de rolar um pouco: a borda do cabeçalho fica mais forte.
  const [scrolled, setScrolled] = useState(false);
  // Referência direta à linha de progresso: ela é atualizada sem passar pelo React (veja abaixo).
  const progressRef = useRef<HTMLSpanElement>(null);

  // Marca a borda quando a página desce e atualiza a barra de progresso. A altura do cabeçalho é fixa:
  // mudar a altura move a página, altera o scrollY e faria a barra tremer.
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      // Progresso = quanto já rolou dividido pelo quanto DÁ para rolar (0 a 1).
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      // Escreve direto no estilo da linha (em vez de usar estado): rolar dispara este código dezenas
      // de vezes por segundo, e redesenhar o componente a cada vez seria desperdício.
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
    };
    onScroll(); // já calcula uma vez na montagem, para a linha começar no ponto certo
    // passive: true avisa o navegador que este código nunca bloqueia a rolagem (mais fluido).
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Envia a busca: vai para /loja?q=termo (ou para /loja sem filtro, se o campo estiver vazio). */
  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    setSearching(false);
    // encodeURIComponent protege o texto digitado para viajar no endereço (acentos, espaços...).
    router.push(q ? `/loja?q=${encodeURIComponent(q)}` : "/loja");
  }

  return (
    // sticky top-0: fica grudado no topo ao rolar. Altura fixa (h-16 no celular, h-20 no computador).
    <header
      className={`sticky top-0 z-50 h-16 border-b bg-background transition-colors duration-300 md:h-20 ${
        scrolled ? "border-foreground" : "border-border"
      }`}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-6 px-6">
        {/* Logo: leva à home. mix-blend-screen faz o fundo preto da imagem sumir sobre o preto do site. */}
        <Link href="/" aria-label="DarkWear, início" className="flex h-full shrink-0 items-center">
          <Image
            src="/brand/logo-dark.jpg"
            alt="DarkWear"
            width={240}
            height={120}
            priority
            className="h-[78%] w-auto mix-blend-screen"
          />
        </Link>

        {/* Menu principal: só aparece em telas largas (lg). No celular, vale o botão "Menu". */}
        <nav aria-label="Principal" className="hidden items-center gap-9 lg:flex">
          {NAV.map((item, i) => {
            // A home só fica "ativa" no endereço exato "/"; as outras valem também para subpáginas
            // (ex.: /loja/camisa-mumia mantém "Loja" destacado).
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group relative inline-flex items-start gap-1 py-2 font-display text-2xl uppercase text-foreground"
              >
                {/* Número pequeno do item (01, 02...), no estilo de índice de revista. */}
                <span className="font-mono text-[10px] text-foreground">{String(i + 1).padStart(2, "0")}</span>
                {/* A palavra rola para cima e a mesma palavra entra por baixo */}
                <span className="relative block overflow-hidden leading-[1.1]">
                  <span className="block transition-transform duration-300 ease-out group-hover:-translate-y-full">{item.label}</span>
                  {/* Cópia da palavra, escondida embaixo, que sobe para o lugar ao passar o mouse.
                      aria-hidden: o leitor de tela lê só uma vez. */}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 block translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0"
                  >
                    {item.label}
                  </span>
                </span>
                {/* Sublinhado grosso que "cresce" da esquerda quando este é o item da página atual. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-1 h-1 origin-left bg-foreground transition-transform duration-300 ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/* Lado direito: busca, sacola e (no celular) o botão do menu. */}
        <div className="flex items-center gap-2 text-base">
          {searching ? (
            // Campo de busca aberto. autoFocus já deixa o cursor nele; o ✕ fecha sem buscar.
            <form onSubmit={onSearch} className="flex items-center gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar peça"
                aria-label="Buscar peça"
                className="w-40 border-b border-foreground bg-transparent py-1 text-base outline-none placeholder:text-muted sm:w-56"
              />
              <button type="button" onClick={() => setSearching(false)} className="px-2 text-muted hover:text-foreground">
                ✕
              </button>
            </form>
          ) : (
            // Só o ícone da lupa; clicar abre o campo de busca.
            <button
              type="button"
              onClick={() => setSearching(true)}
              aria-label="Buscar"
              className="flex h-12 w-12 items-center justify-center text-foreground hover:opacity-70"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
            </button>
          )}

          {/* Ícone da sacola, com o número de peças (só aparece depois de ler o carrinho e se há itens). */}
          <Link
            href="/carrinho"
            aria-label="Sacola"
            className="relative flex h-12 w-12 items-center justify-center text-foreground hover:opacity-70"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 8h14l-1 12H6z" />
              <path d="M9 10V6a3 3 0 0 1 6 0v4" />
            </svg>
            {ready && count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center bg-foreground px-1 text-xs font-medium text-background">
                {count}
              </span>
            )}
          </Link>

          {/* Botão do menu do celular (escondido em telas largas). aria-expanded informa se está aberto. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-2 px-2 text-base lg:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
          >
            {open ? "Fechar" : "Menu"}
          </button>
        </div>
      </div>

      {/* Menu do celular: uma tela cheia (abaixo do cabeçalho) com os links grandes. Clicar num link fecha o menu. */}
      {open && (
        <nav
          id="menu-mobile"
          aria-label="Menu"
          className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto bg-background px-6 py-6 lg:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="border-b border-border py-5 font-display text-4xl uppercase text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      {/* Linha de progresso da rolagem: fica colada na borda de baixo e cresce da esquerda para a direita. */}
      <span
        ref={progressRef}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-foreground"
        style={{ transform: "scaleX(0)" }}
      />
    </header>
  );
}
