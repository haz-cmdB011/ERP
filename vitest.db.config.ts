import { defineConfig } from "vitest/config";
import path from "node:path";

// Pruebas contra la base de datos REAL de Supabase (solo lectura). Se corren
// aparte de `npm test`: `npm run test:db` (necesita .env.local). Ver
// tests-db/base-de-datos.test.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests-db/**/*.test.ts"],
    testTimeout: 30000,
  },
});
