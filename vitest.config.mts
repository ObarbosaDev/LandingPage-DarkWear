import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
  },
});
