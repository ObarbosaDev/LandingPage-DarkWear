// Ilustração de camiseta para o card enquanto a foto real não existe.
// Silhueta reta, sem texto nem efeito.
export function ShirtArt({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 400 400" className="h-[72%] w-auto max-w-[72%]" role="img" aria-label={`Ilustração: ${name}`}>
      <path
        d="M150 60 Q200 88 250 60 L330 90 L372 160 L330 186 L312 160 L312 340 L88 340 L88 160 L70 186 L28 160 L70 90 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="miter"
      />
      <path d="M150 60 Q200 92 250 60" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}
