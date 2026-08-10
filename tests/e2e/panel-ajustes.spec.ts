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

/**
 * Marca de agua para no confundir lo que escribe el test con el seed.
 *
 * OJO CON EL PREFIJO «(DES)»: media suite comprueba que la landing enseña los
 * datos del seed buscando justo esa marca. Este fichero es el único que
 * ESCRIBE en `configuracion_boda`, que es una fila única y compartida por
 * todos los tests. Sin conservar el prefijo, cambiar aquí los nombres tumbaba
 * `resiliencia` y `reserva-la-fecha` — y el fallo salía en el fichero de otro,
 * que es la peor forma de enterarse.
 */
const MARCA = "(DES) E2E";

/**
 * El anunciador de rutas de Next también es `role="alert"`, así que buscarlo a
 * secas encuentra dos y Playwright se planta. Los avisos de esta pantalla viven
 * dentro del `<main>` del panel; el de Next, fuera.
 */
function avisoDe(pagina: import("@playwright/test").Page) {
  return pagina.locator("main").getByRole("alert");
}

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

    // Se guardan los originales para devolverlos al final: la fila es única y
    // la comparten todos los tests de la suite.
    const noviaOriginal = await novia.inputValue();
    const novioOriginal = await novio.inputValue();

    const nuevaNovia = `${MARCA} Paloma`;
    const nuevoNovio = `${MARCA} David`;
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

    await page.goto(RUTA_AJUSTES);
    await page.getByLabel(copy.panel.ajustes.nombreNovia).fill(noviaOriginal);
    await page.getByLabel(copy.panel.ajustes.nombreNovio).fill(novioOriginal);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.getByText(copy.panel.ajustes.guardado)).toBeVisible();
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

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorLimiteTarde);

    // Y lo que importa: no se ha guardado.
    await page.reload();
    await expect(page.getByLabel(copy.panel.ajustes.limiteRsvp)).toHaveValue(antes);
  });

  test("unas coordenadas a medias se rechazan", async ({ page }) => {
    // La base exige las dos o ninguna: media coordenada no señala ningún sitio.
    await page.getByLabel(copy.panel.ajustes.latitud).first().fill("42,5987");
    await page.getByLabel(copy.panel.ajustes.longitud).first().fill("");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorCoordenadas);
  });

  test("un hashtag sin almohadilla se rechaza", async ({ page }) => {
    await page.getByLabel(copy.panel.ajustes.hashtag).fill("PalomaYDavid");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorHashtag);
  });

  /**
   * FALTA EL RECORRIDO SIN JAVASCRIPT, y no por descuido.
   *
   * El formulario sí es un `<form>` con Server Action: se envía sin una línea
   * de JavaScript de cliente. Lo que no funciona sin JS es **pintar la
   * pantalla**, y no es cosa de este ticket: `src/app/panel/loading.tsx` abre
   * un límite de Suspense para todo el segmento, así que Next sirve el
   * contenido dentro de un contenedor oculto y es un script quien lo coloca.
   * Sin JS, el campo existe en el HTML y no se ve. Le pasa a todo el panel
   * desde BODA-42, no sólo a esta pantalla.
   *
   * Se anota en su propia incidencia en lugar de escribir aquí una versión
   * descafeinada del test que pase sin comprobar lo que dice comprobar. Donde
   * esto importa de verdad es en el RSVP (#42), que lo abren invitados desde un
   * móvil prestado: ahí hay que diseñarlo sin Suspense desde el principio.
   */
  test("el aviso de guardado se anuncia sin interrumpir la lectura", async ({ page }) => {
    // El que sale bien es `status` y el que sale mal es `alert`: el primero no
    // debe cortar a un lector de pantalla y el segundo sí.
    await page.getByLabel(copy.panel.ajustes.hashtag).fill("#PalomaYDavid");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.guardado,
    );
  });
});
