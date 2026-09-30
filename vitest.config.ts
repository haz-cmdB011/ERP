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
    // tests-db habla con la base real: se corre aparte (npm run test:db).
    exclude: [...configDefaults.exclude, "tests-db/**"],
  },
});
