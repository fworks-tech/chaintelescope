import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // As suítes de banco compartilham o mesmo schema; em paralelo, uma migração
    // `down` de outro arquivo derruba as tabelas no meio do teste.
    fileParallelism: false,
  },
});
