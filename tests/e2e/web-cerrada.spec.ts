import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";

import { expect, test, type Page } from "./utiles/origen-propio";
import { borrarInvitadosDePrueba, entrarComoInvitado } from "./utiles/invitacion-de-prueba";
import { ponerRetratoDePrueba, quitarRetratoDePrueba } from "./utiles/retrato-de-prueba";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_AJUSTES,
  RUTA_PANEL,
  RUTA_RESERVA_LA_FECHA,
} from "../../src/config/constants";

/**
 * LA WEB CERRADA: «PRÓXIMAMENTE»
 *
 * Hasta que los novios la abren desde Ajustes, quien entra en el dominio ve la
 * noche, el retrato de estrellas, los nombres y la fecha, y nada más. Ellos,
 * con sesión en el panel, la ven entera con un aviso de vista previa.
 *
 * `configuracion_boda` es una fila única que comparte toda la suite: este
 * fichero la cierra al empezar y la deja abierta al acabar, que es como la
 * siembra el seed.
 */

const cadena = process.env.DATABASE_URL;
const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

async function ponerLaWeb(abierta: boolean): Promise<void> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`update public.configuracion_boda set web_abierta = ${abierta}`;
  } finally {
    await sql.end();
  }
}

const proximamente = (pagina: Page) => pagina.locator('main[data-web="cerrada"]');

test.describe.configure({ mode: "serial" });

test.describe("La web cerrada", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para cerrar la web.");

  test.beforeAll(async () => {
    await ponerLaWeb(false);
    await ponerRetratoDePrueba();
  });

  test.afterAll(async () => {
    if (!cadena) return;
    await ponerLaWeb(true);
    await quitarRetratoDePrueba();
    await borrarInvitadosDePrueba();
  });

  test("quien entra ve «Próximamente»: la noche, los nombres, la fecha y el retrato", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(proximamente(page)).toBeVisible();
    await expect(proximamente(page)).toContainText(copy.proximamente.etiqueta);
    await expect(proximamente(page)).toContainText(copy.proximamente.texto);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES) Ana");
    await expect(proximamente(page).locator("time")).toBeVisible();
    await expect(page.locator('[data-tramo="noche"] [data-cielo-estrellado]')).toBeVisible();
    await expect(page.locator("[data-retrato]")).toBeVisible();
  });

  /**
   * CASO DE ERROR · Cerrada es cerrada: ni las secciones, ni el menú, ni los
   * datos que sólo dice la web —el lugar, la víspera— viajan en el HTML.
   */
  test("de la web no se enseña nada, ni en el HTML", async ({ page }) => {
    const respuesta = await page.goto("/");
    const html = (await respuesta!.text()) ?? "";

    await expect(page.locator("#portada, #programa, #preboda, #transporte")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.locator("[data-vista-previa]")).toHaveCount(0);
    expect(html).not.toContain("(DES) Finca de pruebas");
    expect(html).not.toContain("(DES) el Barrio Húmedo");
  });

  /** CASO DE ERROR · El enlace de una invitación no abre la puerta. */
  test("con el enlace de su invitación tampoco se ve la web", async ({ page }) => {
    await entrarComoInvitado(page, "web-cerrada");

    await expect(proximamente(page)).toBeVisible();
    await expect(page.locator("#portada")).toHaveCount(0);
  });

  test("el Save the Date sigue en su sitio", async ({ page }) => {
    const respuesta = await page.goto(RUTA_RESERVA_LA_FECHA);

    expect(respuesta?.status()).toBe(200);
    await expect(proximamente(page)).toHaveCount(0);
  });

  test("«Próximamente» pasa axe", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(proximamente(page)).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    const graves = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(graves.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test.describe("desde el panel", () => {
    test.skip(
      !CORREO_CON_ACCESO || !CONTRASENA,
      "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
    );

    test.beforeEach(async ({ page }) => {
      await page.goto(RUTA_ACCESO);
      await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
      await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
      await page.getByRole("button", { name: copy.acceso.entrar }).click();
      await page.waitForURL((url) => url.pathname.startsWith(RUTA_PANEL));
    });

    test("los novios la ven entera, con el aviso de vista previa", async ({ page }) => {
      await page.goto("/");

      await expect(page.locator("#portada")).toBeVisible();
      await expect(proximamente(page)).toHaveCount(0);
      const aviso = page.locator("[data-vista-previa]");
      await expect(aviso).toContainText(copy.panel.ajustes.vistaPrevia);
      await expect(
        aviso.getByRole("link", { name: copy.panel.ajustes.vistaPreviaAbrir }),
      ).toHaveAttribute("href", new RegExp(`^${RUTA_AJUSTES}#`));
    });

    test("se abre y se cierra desde Ajustes, y la ve todo el que entra", async ({
      page,
      browser,
    }) => {
      await page.goto(RUTA_AJUSTES);
      await expect(page.getByText(copy.panel.ajustes.webCerrada)).toBeVisible();
      await page.getByRole("button", { name: copy.panel.ajustes.abrirWeb }).click();
      await expect(page.locator("main").getByRole("status")).toContainText(
        copy.panel.ajustes.webAbiertaHecho,
      );
      await expect(page.getByText(copy.panel.ajustes.webAbierta)).toBeVisible();

      // Quien no tiene sesión ya la ve, sin aviso de vista previa.
      const fuera = await browser.newContext();
      const visita = await fuera.newPage();
      await visita.goto("/");
      await expect(visita.locator("#portada")).toBeVisible();
      await expect(visita.locator("[data-vista-previa]")).toHaveCount(0);

      // Y al cerrarla, vuelve «Próximamente».
      await page.getByRole("button", { name: copy.panel.ajustes.cerrarWeb }).click();
      await expect(page.getByText(copy.panel.ajustes.webCerrada)).toBeVisible();
      await visita.goto("/");
      await expect(proximamente(visita)).toBeVisible();
      await fuera.close();
    });
  });
});
