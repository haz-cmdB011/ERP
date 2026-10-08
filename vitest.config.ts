import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // tests-db habla con la base real: se corre aparte (npm run test:db). e2e/ son las
    // pruebas de navegador de Playwright (npm run test:e2e).
    exclude: [...configDefaults.exclude, "tests-db/**", "e2e/**"],
  },
});
