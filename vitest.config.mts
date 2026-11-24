// ============================================================================
// Configuração dos TESTES (Vitest). Roda com "npm test".
//
// O que ela resolve:
//   - os testes usam os mesmos apelidos de import do projeto ("@/..." = pasta src);
//   - o pacote "server-only" (que quebra o build se importado no navegador) é trocado por um módulo
//     vazio, para os testes poderem importar o código do servidor;
//   - todos os testes ficam na pasta tests/ e rodam no ambiente Node (não no navegador).
// O arquivo é .mts (módulo moderno) para o Vitest carregá-lo sem avisos.
// ============================================================================

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Converte um caminho relativo a este arquivo em um caminho absoluto de disco.
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // No Next, o pacote server-only é trocado por um módulo vazio no servidor. Nos testes fazemos o mesmo.
      "server-only": src("./tests/stubs/server-only.ts"),
      "@": src("./src"),
    },
  },
  test: {
    // Ambiente Node: os testes cobrem regras do servidor, não telas.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Executado antes de cada arquivo de teste: prepara o banco em memória e variáveis falsas.
    setupFiles: ["tests/setup.ts"],
    // Tempo máximo de um teste. Folgado, porque o banco embutido leva alguns segundos para subir.
    testTimeout: 30_000,
    // Tempo máximo dos preparos (beforeEach). Cada arquivo sobe o seu próprio banco em memória, e com
    // muitos arquivos rodando juntos o primeiro arranque passa de 10 s (o padrão), sem haver erro algum.
    hookTimeout: 60_000,
    // No máximo 6 arquivos de teste ao mesmo tempo. Cada arquivo sobe o seu próprio Postgres embutido (centenas de MB
    // de memória): com todos os núcleos em uso, um processo de teste podia ser encerrado por falta de memória e levar
    // junto os testes do arquivo, sem nenhuma mensagem de erro. Com 6 a suíte fica estável e custa só alguns segundos.
    maxWorkers: 6,
  },
});
