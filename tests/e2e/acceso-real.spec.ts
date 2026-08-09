import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-40 · El recorrido completo, contra un Supabase de verdad
 *
 * Lo que `acceso.spec.ts` no puede probar: correo → enlace → sesión → panel.
 * Hace falta GoTrue funcionando y un buzón donde leer el correo, así que este
 * fichero solo corre en el trabajo de CI que levanta el Supabase local.
 *
 * Se salta en cualquier otro sitio en lugar de fallar: un test que no puede
 * ejecutarse no es un test roto.
 */

const BUZON = process.env.URL_BUZON;
const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CORREO_SIN_ACCESO = process.env.CORREO_SIN_ACCESO;

test.describe("Acceso de verdad", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !BUZON || !CORREO_CON_ACCESO || !CORREO_SIN_ACCESO,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /** Vacía el buzón para que cada test lea su propio correo y no el anterior. */
  async function vaciarBuzon() {
    await fetch(`${BUZON}/api/v1/messages`, { method: "DELETE" });
  }

  /** Saca el enlace de acceso del último correo recibido. */
  async function ultimoEnlace(): Promise<string> {
    const listado = await (await fetch(`${BUZON}/api/v1/messages`)).json();
    const mensaje = listado.messages?.[0];
    expect(mensaje, "no ha llegado ningún correo").toBeTruthy();

    const cuerpo = await (await fetch(`${BUZON}/api/v1/message/${mensaje.ID}`)).json();
    const texto: string = `${cuerpo.Text ?? ""}${cuerpo.HTML ?? ""}`;

    const enlace = texto.match(/https?:\/\/[^\s"'<>]*token_hash=[^\s"'<>&]+[^\s"'<>]*/)?.[0];
    expect(enlace, "el correo no traía enlace de acceso").toBeTruthy();
    return enlace!.replace(/&amp;/g, "&");
  }

  test.beforeEach(async () => {
    await vaciarBuzon();
  });

  test("recorrido completo: correo, enlace y dentro", async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByRole("button", { name: copy.acceso.enviar }).click();
    await expect(page.getByRole("main").getByRole("status")).toBeVisible();

    await page.goto(await ultimoEnlace());

    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toBeVisible();
  });

  test("la sesión sobrevive a recargar y a volver a entrar", async ({ page }) => {
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    // Con sesión, la página de acceso no tiene sentido: lleva al panel.
    await page.goto(RUTA_ACCESO);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  });

  test("al cerrar sesión se sale de verdad", async ({ page }) => {
    await page.goto(RUTA_PANEL);
    await page.getByRole("button", { name: copy.acceso.cerrarSesion }).click();

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    // Y volver atrás en el navegador no devuelve al panel.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
  });

  test("el mismo enlace no vale dos veces", async ({ page, context }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByRole("button", { name: copy.acceso.enviar }).click();
    await expect(page.getByRole("main").getByRole("status")).toBeVisible();

    const enlace = await ultimoEnlace();
    await page.goto(enlace);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    // Desde una sesión limpia, el mismo enlace ya está gastado.
    await context.clearCookies();
    await page.goto(enlace);
    await expect(page).toHaveURL(new RegExp("estado=enlace-invalido"));
  });

  // --- El caso que de verdad importa -----------------------------------

  test("un correo sin perfil activo recibe su enlace y NO entra", async ({ page, context }) => {
    await context.clearCookies();

    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_SIN_ACCESO!);
    await page.getByRole("button", { name: copy.acceso.enviar }).click();

    // Mismo mensaje que para quien sí tiene acceso: la página no puede ser un
    // comprobador de quién entra al panel.
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      copy.acceso.comprobadCorreo,
    );

    // El enlace es válido —existe en auth.users— pero el panel no se abre:
    // quien decide es `perfiles`, y su perfil está desactivado.
    await page.goto(await ultimoEnlace());

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(
      copy.acceso.titulo,
    );
  });
});
