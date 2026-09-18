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

  /**
   * BODA-114 y BODA-116 · La ciudad y los avisos del programa se editan aquí
   * y se ven en la landing. Se restauran al acabar: el seed los deja puestos
   * y el resto de la suite cuenta con ellos.
   */
  test("la ciudad y los avisos del programa se guardan y salen en la landing", async ({
    page,
  }) => {
    const ciudad = page.getByLabel(copy.panel.ajustes.ciudad);
    const avisos = page.getByLabel(copy.panel.ajustes.avisosPrograma);
    const ciudadOriginal = await ciudad.inputValue();
    const avisosOriginales = await avisos.inputValue();

    await ciudad.fill("(DES) Astorga");
    await avisos.fill("(DES) Aviso uno\n\n(DES) Aviso dos\n");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.guardado,
    );

    await page.goto("/");
    await expect(page.locator("#portada p").first()).toContainText("(DES) Astorga", {
      ignoreCase: true,
    });
    // Las líneas en blanco no cuentan: dos avisos, no cuatro.
    await expect(page.locator("#programa ol + ul li")).toHaveCount(2);
    await expect(page.locator("#programa ol + ul")).toContainText("(DES) Aviso dos");

    await page.goto(RUTA_AJUSTES);
    await page.getByLabel(copy.panel.ajustes.ciudad).fill(ciudadOriginal);
    await page.getByLabel(copy.panel.ajustes.avisosPrograma).fill(avisosOriginales);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.guardado,
    );
  });

  /**
   * BODA-129 · LA CUENTA PARA LOS REGALOS.
   *
   * Era lo último de la landing que sólo se tocaba por SQL, y la única cosa de
   * esta pantalla que un editor **no** puede cambiar: su política es
   * `configuracion_privada_propietario_actualizar`, no `puede_editar()`. Por eso
   * va en su propio formulario y con su propio botón — con uno solo, o se le
   * niega a un editor todo lo demás o se le cuela el número de cuenta.
   *
   * Se restaura al acabar: la fila es única, el seed trae un IBAN y
   * `regalos.spec.ts` y el menú de la landing cuentan con él.
   */
  test("el IBAN se escribe aquí, se normaliza y sale en la web", async ({ page }) => {
    const iban = page.getByLabel(copy.panel.ajustes.iban, { exact: true });
    const titular = page.getByLabel(copy.panel.ajustes.titularCuenta);

    const ibanOriginal = await iban.inputValue();
    const titularOriginal = await titular.inputValue();

    const titularNuevo = `${MARCA} Paloma y David`;

    // EN MINÚSCULAS Y CON ESPACIOS, que es como se copia de la app del banco.
    // La restricción de la tabla no lo acepta así, y quien lo pega no tiene por
    // qué saberlo: lo arregla la acción, no la persona.
    await iban.fill("es76 2100 0418 4502 0005 1332");
    await titular.fill(titularNuevo);
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();

    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.regalosGuardado,
    );

    await page.reload();
    await expect(
      page.getByLabel(copy.panel.ajustes.iban, { exact: true }),
      "se guarda como lo pide el banco, no como se tecleó",
    ).toHaveValue("ES7621000418450200051332");

    // Y en la web, detrás de su botón: el número no viaja en el HTML (BODA-28).
    await page.goto("/");
    const seccion = page.locator("#regalos");
    await seccion.getByRole("button", { name: copy.regalos.revelar }).click();
    await expect(seccion.getByLabel(copy.regalos.etiquetaCuenta)).toHaveValue(
      "ES76 2100 0418 4502 0005 1332",
    );
    await expect(seccion.getByText(titularNuevo)).toBeVisible();

    // Como estaba.
    await page.goto(RUTA_AJUSTES);
    await page.getByLabel(copy.panel.ajustes.iban, { exact: true }).fill(ibanOriginal);
    await page.getByLabel(copy.panel.ajustes.titularCuenta).fill(titularOriginal);
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.regalosGuardado,
    );
  });

  /**
   * CASO DE ERROR. Un IBAN con mala pinta se rechaza con una frase, y no con el
   * nombre de la restricción de Postgres, que es lo que se ve si esto llega a
   * la base.
   */
  test("un IBAN con mala pinta se rechaza y no se guarda", async ({ page }) => {
    const iban = page.getByLabel(copy.panel.ajustes.iban, { exact: true });
    const antes = await iban.inputValue();

    await iban.fill("mi cuenta de toda la vida");
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorIban);

    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.iban, { exact: true })).toHaveValue(antes);
  });

  /**
   * CASO DE ERROR. Siete avisos no caben en una fila de etiquetas: se rechazan
   * antes de llegar a la base, con un mensaje en castellano, y no se guarda
   * nada de lo demás.
   */
  test("más de seis avisos se rechazan y no se guarda nada", async ({ page }) => {
    const avisos = page.getByLabel(copy.panel.ajustes.avisosPrograma);
    const antes = await avisos.inputValue();

    await avisos.fill(["a", "b", "c", "d", "e", "f", "g"].map((l) => `(DES) ${l}`).join("\n"));
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorAvisos);
    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.avisosPrograma)).toHaveValue(antes);
  });
});
