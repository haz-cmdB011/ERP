import { defineConfig, devices } from "@playwright/test";

// Pruebas de navegador (humo): recorren lo público de la app ya compilada. No usan la
// base de datos ni inician sesión, así que corren igual en el CI con claves de relleno.
// Los flujos con sesión (subir Excel, liberar a Producción, capturar y pagar un recibo)
// necesitan una base de pruebas; ver docs/operacion.md.
//
//   npm run build && npm run test:e2e
//
// En local usa el Chrome instalado (no hay que descargar nada); en el CI, el Chromium
// que instala `playwright install`.
const puerto = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${puerto}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "escritorio",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" },
    },
    {
      name: "celular",
      use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${puerto}`,
    url: `http://localhost:${puerto}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
