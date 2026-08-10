import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_AJUSTES, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-44 · Ajustes de la boda
 *
 * Lo que se comprueba aquí es la cadena entera, no la pantalla: que lo que se
 * escribe en el panel sale en la portada de la landing. Si esa vuelta funciona,
 * `configuracion_boda` está de verdad cableada — que es todo el ticket.
 *
 * Necesita sesión, así que vive en el trabajo de CI que levanta el Supabase
 * local y se salta en cualquier otro sitio.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

/** Marca de agua para no confundir lo que escribe el test con el seed. */
const SUFIJO = "-E2E";

test.describe("Ajustes de la boda", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
    await page.goto(RUTA_AJUSTES);
  });

  test("se llega desde el menú del panel", async ({ page }) => {
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.ajustes }).click();

    await expect(page).toHaveURL(new RegExp(RUTA_AJUSTES));
    await expect(page.getByRole("heading", { name: copy.panel.ajustes.titulo })).toBeVisible();
  });

  test("la pantalla llega con los datos que hay en la base", async ({ page }) => {
    // Vacío significaría que la consulta no trajo nada y el formulario
    // guardaría encima un hueco.
    await expect(page.getByLabel(copy.panel.ajustes.nombreNovia)).not.toHaveValue("");
    await expect(page.getByLabel(copy.panel.ajustes.fechaCeremonia)).not.toHaveValue("");
  });

  /**
   * CAMINO FELIZ. Cambiar los nombres en el panel los cambia en la portada.
   */
  test("cambiar los nombres los cambia en la portada de la landing", async ({ page }) => {
    const novia = page.getByLabel(copy.panel.ajustes.nombreNovia);
    const novio = page.getByLabel(copy.panel.ajustes.nombreNovio);

    const nuevaNovia = `Paloma${SUFIJO}`;
    const nuevoNovio = `David${SUFIJO}`;
    await novia.fill(nuevaNovia);
    await novio.fill(nuevoNovio);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.getByText(copy.panel.ajustes.guardado)).toBeVisible();
    // Y persiste: al recargar sigue ahí, no era sólo el eco del formulario.
    await page.reload();
    await expect(page.getByLabel(copy.panel.ajustes.nombreNovia)).toHaveValue(nuevaNovia);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(nuevaNovia);
    await expect(page.getByText(nuevoNovio).first()).toBeVisible();
  });

  test("la hora de la ceremonia no se mueve al guardar sin tocarla", async ({ page }) => {
    // El fallo clásico de estos formularios: cada guardado corre la hora unas
    // horas porque el texto sin zona se interpreta con la del servidor.
    const campo = page.getByLabel(copy.panel.ajustes.fechaCeremonia);
    const antes = await campo.inputValue();

    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.getByText(copy.panel.ajustes.guardado)).toBeVisible();

    await expect(page.getByLabel(copy.panel.ajustes.fechaCeremonia)).toHaveValue(antes);
  });

  /**
   * CASO DE ERROR. Una fecha límite posterior a la boda se rechaza con un
   * mensaje claro y no se guarda.
   */
  test("una fecha límite posterior a la boda se rechaza y no se guarda", async ({ page }) => {
    const ceremonia = await page.getByLabel(copy.panel.ajustes.fechaCeremonia).inputValue();
    const limite = page.getByLabel(copy.panel.ajustes.limiteRsvp);
    const antes = await limite.inputValue();

    // Un año después de la ceremonia: imposible por definición.
    const tarde = ceremonia.replace(/^(\d{4})/, (anio) => String(Number(anio) + 1));
    await limite.fill(tarde);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.getByRole("alert")).toContainText(copy.panel.ajustes.errorLimiteTarde);

    // Y lo que importa: no se ha guardado.
    await page.reload();
    await expect(page.getByLabel(copy.panel.ajustes.limiteRsvp)).toHaveValue(antes);
  });

  test("unas coordenadas a medias se rechazan", async ({ page }) => {
    // La base exige las dos o ninguna: media coordenada no señala ningún sitio.
    await page.getByLabel(copy.panel.ajustes.latitud).first().fill("42,5987");
    await page.getByLabel(copy.panel.ajustes.longitud).first().fill("");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.getByRole("alert")).toContainText(copy.panel.ajustes.errorCoordenadas);
  });

  test("un hashtag sin almohadilla se rechaza", async ({ page }) => {
    await page.getByLabel(copy.panel.ajustes.hashtag).fill("PalomaYDavid");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.getByRole("alert")).toContainText(copy.panel.ajustes.errorHashtag);
  });

  test("el formulario se envía sin JavaScript", async ({ browser }) => {
    // Los datos más visibles de la boda no pueden depender de que cargue un
    // bundle. Es un `<form>` con Server Action, así que tiene que ir igual.
    const contexto = await browser.newContext({ javaScriptEnabled: false });
    const pagina = await contexto.newPage();

    await pagina.goto(RUTA_ACCESO);
    await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
    await pagina.waitForURL(new RegExp(RUTA_PANEL));

    await pagina.goto(RUTA_AJUSTES);
    const marca = `SinJS${SUFIJO}`;
    await pagina.getByLabel(copy.panel.ajustes.nombreNovia).fill(marca);
    await pagina.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(pagina.getByText(copy.panel.ajustes.guardado)).toBeVisible();
    await expect(pagina.getByLabel(copy.panel.ajustes.nombreNovia)).toHaveValue(marca);

    await contexto.close();
  });
});
