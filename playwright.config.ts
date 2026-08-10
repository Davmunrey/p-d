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
        /**
         * El servidor escribe en el registro por qué rechaza un acceso; la
         * pantalla, a propósito, no lo cuenta. Sin este `pipe` ese motivo se
         * queda dentro del proceso y un fallo de CI sólo dice «no entró».
         */
        stdout: "pipe",
        stderr: "pipe",
        env: {
          /**
           * Por defecto, un Supabase que NO EXISTE, a propósito.
           *
           * El acceso al panel tiene que comportarse igual de bien cuando el
           * servidor de autenticación no responde: el mismo mensaje neutro, sin
           * revelar si un correo tiene acceso, y sin dejar entrar a nadie.
           * Apuntando a un puerto cerrado, cada petición falla de verdad y los
           * tests recorren ese camino sin simular nada.
           *
           * OJO CON EL `??`: si estos valores se fijaran sin condición, el
           * trabajo de CI que levanta un Supabase de verdad recibiría igualmente
           * el puerto cerrado y no podría probar nada. Pasó.
           */
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "clave-de-pruebas-sin-valor",
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? URL_BASE,

          /*
            EL CORREO, APUNTANDO A UN PUERTO CERRADO POR DEFECTO.

            Es deliberado, y es la misma idea que el Supabase inexistente de
            arriba: así el camino de «el proveedor no responde» se recorre en
            CADA ejecución de la suite, y no sólo en el test que lo busca. Si
            algún día un fallo de correo tumbara una confirmación, se caerían
            veinte tests a la vez en lugar de ninguno.

            El test del acuse levanta un buzón de captura en ese puerto y lee
            lo que se mandó de verdad.
          */
          RESEND_API_KEY: process.env.RESEND_API_KEY ?? "clave-de-pruebas-sin-valor",
          CORREO_REMITENTE: process.env.CORREO_REMITENTE ?? "boda@ejemplo.test",
          RESEND_URL: process.env.RESEND_URL ?? "http://127.0.0.1:54999",
        },
      },
});
