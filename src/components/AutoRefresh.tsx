// ============================================================================
// Atualiza a página sozinha de tempos em tempos, por um tempo limitado.
//
// Quem usa: /pagamento/retorno, enquanto o pagamento ainda não foi confirmado (o Pix, por exemplo,
// leva alguns segundos para o aviso chegar). Ao confirmar, a página deixa de renderizar este
// componente e a atualização para sozinha. Depois do limite, para também: não fica pedindo ao
// servidor para sempre se o cliente deixou a aba aberta.
// ============================================================================

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ everyMs = 4000, maxTimes = 30 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      router.refresh(); // pede o servidor de novo, sem recarregar a página inteira
      if (n >= maxTimes) clearInterval(id);
    }, everyMs);
    return () => clearInterval(id); // ao sair da página, para
  }, [router, everyMs, maxTimes]);
  return null;
}
