import { defineConfig } from "vitest/config";

if (!process.env.DATABASE_URL) {
  // Sem banco, o `skipIf` das suítes as pularia em silêncio; aqui o run falha.
  throw new Error(
    "DATABASE_URL is required for integration tests (see apps/api/.env.example)",
  );
}

export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    // As suítes compartilham o mesmo schema; em paralelo, a migração `down` de
    // outro arquivo derruba as tabelas no meio do teste.
    fileParallelism: false,
  },
});
