import { defineConfig, devices } from "@playwright/test";

/**
 * Regla 4 del proyecto: cada ticket entrega su test E2E. Esta configuración es
 * la que hace que eso sea ejecutable.
 *
 * Se prueba en Chromium de escritorio y en Safari móvil: la mayoría de
 * invitados abrirá el enlace desde WhatsApp en el móvil.
 */

const PUERTO = process.env.PORT ?? "3000";
const URL_BASE = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PUERTO}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: URL_BASE,
    trace: "on-first-retry",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  },

  /**
   * En entornos que ya traen Chromium preinstalado (contenedores de desarrollo)
   * se apunta al binario existente en lugar de descargar otro. En CI la
   * variable no está definida y se usa el navegador que instala Playwright.
   */
  projects: [
    {
      name: "escritorio",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
    {
      name: "movil",
      use: { ...devices["iPhone 14"] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: URL_BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
