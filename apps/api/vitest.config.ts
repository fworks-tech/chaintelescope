import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // As suítes de banco rodam só em `pnpm test:integration`.
    exclude: [...configDefaults.exclude, "test/**/*.integration.test.ts"],
  },
});
