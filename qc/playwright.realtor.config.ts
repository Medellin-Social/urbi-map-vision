import { defineConfig, devices } from "@playwright/test";

// E2E del ciclo de vida del listing en el Centro de agente. Distinto del QC de
// prod (playwright.config.ts): corre contra un dev server LOCAL con el mock
// stateful del realtor (VITE_REALTOR_USE_MOCK=true), así el ciclo
// crear→editar→pausar→reactivar→eliminar→cerrar es manejable sin DB/auth/seed.
//
// Verifica el FLUJO DE UI, no el backend (las mutaciones pegan al mock). Para
// probar el backend real hay que sembrar una cuenta agente en DEV (fuera de alcance).
//
// Archivos *.e2e.ts en ./e2e → ni vitest ni el QC de prod los levantan.
const PORT = Number(process.env.QC_REALTOR_PORT ?? 5199);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../qc-report-realtor" }],
    ["json", { outputFile: "../qc-report-realtor/results.json" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: "on",
    trace: "retain-on-failure",
    locale: "es-CO",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_REALTOR_USE_MOCK: "true" },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
