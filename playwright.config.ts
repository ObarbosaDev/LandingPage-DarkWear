// ============================================================================
// Configuração dos testes PONTA A PONTA (Playwright): um navegador de verdade usando o site de verdade.
//
//   npm run test:e2e          roda os roteiros da pasta e2e/
//
// O que acontece: o Playwright prepara um banco NOVO e descartável (scripts/e2e-prep.ts: cupom e administrador de
// teste), sobe o site de desenvolvimento na porta 3220 e abre o Chrome que já está instalado no computador (não baixa
// navegador). Nada toca no banco de desenvolvimento do dia a dia (.data/pglite) nem em produção: o banco dos testes fica
// em .data/e2e e é apagado a cada execução. Os testes unitários (npm test) continuam separados, na pasta tests/.
// ============================================================================

import { defineConfig } from "@playwright/test";

const PORTA = 3220;

export default defineConfig({
  testDir: "./e2e",
  // Roteiros em sequência: eles compartilham o mesmo banco de teste e o mesmo site.
  workers: 1,
  fullyParallel: false,
  // Cada roteiro tem tempo de sobra: o site de desenvolvimento compila cada tela na primeira visita.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    channel: "chrome",
    locale: "pt-BR",
    // Fica o rastro (vídeo e captura) só quando algo falha.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx tsx --conditions=react-server scripts/e2e-prep.ts && npx next dev -p ${PORTA}`,
    url: `http://localhost:${PORTA}/loja`,
    timeout: 180_000,
    // Sempre um site novo, com o banco recém-preparado: nunca reaproveita um servidor que já esteja de pé.
    reuseExistingServer: false,
    env: {
      PGLITE_DIR: ".data/e2e",
      CUSTOMER_SESSION_SECRET: "segredo-de-teste-ponta-a-ponta-com-mais-de-32-caracteres",
      SITE_URL: `http://localhost:${PORTA}`,
      // Sem Mercado Pago nem Pix: o roteiro fecha pelo WhatsApp (que é interceptado, nada sai do computador).
      MERCADOPAGO_ACCESS_TOKEN: "",
      PIX_DISCOUNT_PERCENT: "",
    },
  },
});
