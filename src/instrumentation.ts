// Roda uma vez quando o servidor sobe. Confere a configuração e avisa nos logs do que estiver faltando.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkEnv } = await import("@/server/env");
  const { errors, warnings } = checkEnv();
  for (const w of warnings) console.warn(`[config] ${w}`);
  for (const e of errors) console.error(`[config] ERRO: ${e}`);

  // Em produção, configuração com erro derruba a subida: melhor falhar já do que vender para um número
  // que não existe. No build não derruba, porque o ambiente de build pode não ter tudo.
  if (errors.length > 0 && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`Configuração inválida:\n- ${errors.join("\n- ")}`);
  }
}
