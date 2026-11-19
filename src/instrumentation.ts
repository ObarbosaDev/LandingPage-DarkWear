// ============================================================================
// Gancho de inicialização do Next.js (o nome "instrumentation.ts" é reconhecido pelo framework).
// A função register() roda UMA vez, quando o servidor sobe, antes de atender qualquer visita.
//
// Aqui ela confere a configuração do ambiente (src/server/env.ts) e escreve avisos no log. Assim o
// problema de "esqueci de configurar X" aparece na subida, e não quando um cliente tenta comprar.
// ============================================================================

// Roda uma vez quando o servidor sobe. Confere a configuração e avisa nos logs do que estiver faltando.
export async function register() {
  // O Next também usa este arquivo em outros ambientes de execução (ex.: "edge"), que não têm o que
  // precisamos. A conferência só faz sentido no servidor Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Import dinâmico: o código só é carregado quando de fato vai rodar.
  const { checkEnv } = await import("@/server/env");
  const { errors, warnings } = checkEnv();
  // Prefixo [config] facilita achar estas linhas nos logs da Vercel.
  for (const w of warnings) console.warn(`[config] ${w}`);
  for (const e of errors) console.error(`[config] ERRO: ${e}`);

  // Em produção, configuração com erro derruba a subida: melhor falhar já do que vender para um número
  // que não existe. No build não derruba, porque o ambiente de build pode não ter tudo.
  if (errors.length > 0 && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`Configuração inválida:\n- ${errors.join("\n- ")}`);
  }
}
