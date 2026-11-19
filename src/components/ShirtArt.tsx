// ============================================================================
// Espaço de uma peça SEM FOTO: um quadro com as iniciais do nome (ex.: "Camisa Múmia" → "CM").
// É usado por ProductImage no lugar da foto, em qualquer tela. (O nome do arquivo é histórico: antes
// desenhava uma camiseta; hoje é só um bloco tipográfico, sem ilustração.)
// ============================================================================

// Espaço da peça enquanto ela não tem foto: um bloco com as iniciais do nome, sem desenho de camiseta.
export function ShirtArt({ name }: { name: string }) {
  // Pega a primeira letra das duas primeiras palavras do nome e deixa em maiúsculas.
  const iniciais = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    // role="img" + aria-label: para leitores de tela, o quadro inteiro é "uma imagem sem foto desta peça".
    // border-current usa a cor do texto do lugar onde estiver (serve para fundo preto ou branco).
    <div
      role="img"
      aria-label={`Sem foto: ${name}`}
      className="flex h-[72%] w-[72%] max-w-[72%] items-center justify-center border-2 border-current"
    >
      <span className="font-display text-[clamp(4rem,10vw,8rem)] uppercase leading-none">{iniciais}</span>
    </div>
  );
}
