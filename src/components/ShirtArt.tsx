// Espaço da peça enquanto ela não tem foto: um bloco com as iniciais do nome, sem desenho de camiseta.
export function ShirtArt({ name }: { name: string }) {
  const iniciais = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      role="img"
      aria-label={`Sem foto: ${name}`}
      className="flex h-[72%] w-[72%] max-w-[72%] items-center justify-center border-2 border-current"
    >
      <span className="font-[family-name:var(--font-display)] text-[clamp(4rem,10vw,8rem)] uppercase leading-none">{iniciais}</span>
    </div>
  );
}
