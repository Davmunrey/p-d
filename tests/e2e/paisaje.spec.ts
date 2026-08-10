import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

/**
 * BODA-27 · Paisaje
 *
 * LA FRASE SALE DE LA BASE, NO DEL CÓDIGO, y eso es lo que se prueba: no que
 * aparezca un texto, sino que **cambiarlo en la base lo cambia en la web**. Una
 * frase escrita en el JSX pasaría cualquier comprobación de «se ve algo» y
 * obligaría a un despliegue para corregir una ciudad mal puesta.
 *
 * Y QUE SIN FRASE NO HAY SECCIÓN. Una foto aérea muda es un fondo bonito que no
 * dice nada; antes ocultarla que dejar media sección. La foto, en cambio, no
 * manda: sin ella la sección se sostiene sobre el plano hundido que ya usa la
 * portada, porque la frase es el mensaje y la foto es cómo se presenta.
 *
 * Corre contra la base real: la landing lee de PostgreSQL directamente, así que
 * aquí no hace falta sesión ni Supabase entero.
 */

const cadena = process.env.DATABASE_URL;

/**
 * TODO EL FICHERO EN SERIE: los tests tocan `configuracion_boda`, que es una
 * fila única de la que depende la landing entera. Es la misma lección que dejó
 * el spec de «reserva la fecha» al apagar una sección.
 */
test.describe.configure({ mode: "serial" });

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

async function leerFrase(): Promise<string | null> {
  const [fila] = await conBase(
    (sql) => sql<{ frase_paisaje: string | null }[]>`
      select frase_paisaje from public.configuracion_boda limit 1
    `,
  );
  return fila.frase_paisaje;
}

async function fijarFrase(frase: string | null): Promise<void> {
  await conBase((sql) => sql`update public.configuracion_boda set frase_paisaje = ${frase}`);
}

const seccion = (pagina: Page) => pagina.locator("#paisaje");

test.describe("El paisaje", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  /** Se devuelve la boda a como estaba, pase lo que pase. */
  let original: string | null;

  test.beforeAll(async () => {
    original = await leerFrase();
  });

  test.afterAll(async () => {
    await fijarFrase(original);
  });

  /**
   * CAMINO FELIZ · la frase de la base es la que se ve.
   */
  test("la frase que hay en la base es la que aparece", async ({ page }) => {
    await fijarFrase(original);
    await page.goto("/");

    const guardada = await leerFrase();
    expect(guardada, "el seed tiene que traer una frase para poder probar esto").toBeTruthy();

    await expect(seccion(page)).toBeVisible();
    await expect(seccion(page)).toContainText(guardada!);

    // Y el cierre de la entrega, que es lo que invita a seguir bajando.
    await expect(seccion(page)).toContainText(copy.paisaje.seguidBajando);
  });

  /**
   * CASO DE ERROR · cambiarla en la base la cambia en la web.
   *
   * Es la comprobación que de verdad descarta el literal: una frase escrita en
   * el código pasaría el camino feliz —coincidiría con el seed— y sólo falla
   * aquí.
   */
  test("cambiar la frase en la base la cambia en la web", async ({ page }) => {
    const otra = "(DES) Vino de un sitio y fue a parar a otro";
    await fijarFrase(otra);

    await page.goto("/");

    await expect(seccion(page)).toContainText(otra);
    await expect(seccion(page), "y la anterior ya no está").not.toContainText(original!);
  });

  /**
   * CASO DE ERROR · sin frase, no hay sección.
   */
  test("sin frase configurada la sección desaparece", async ({ page }) => {
    await fijarFrase(null);

    await page.goto("/");

    await expect(
      seccion(page),
      "sin nada que decir, la sección no se pinta a medias",
    ).toHaveCount(0);

    /*
      Y tampoco queda su entrada en el menú: una navegación que lleva a un ancla
      que no existe es peor que no ofrecerla.
    */
    await expect(
      page.getByRole("link", { name: copy.navegacion.secciones.paisaje }),
    ).toHaveCount(0);
  });

  /**
   * LA FOTO NO MANDA. Todavía no hay ninguna publicada para esta sección, así
   * que este test comprueba el estado real de hoy: la sección se ve igual, con
   * su frase, sobre el plano hundido. El día que se suba la foto seguirá
   * pasando — lo que se afirma es que la frase no depende de ella.
   */
  test("sin foto la sección se sostiene igual", async ({ page }) => {
    await fijarFrase(original);
    await page.goto("/");

    await expect(seccion(page)).toBeVisible();
    await expect(seccion(page)).toContainText(original!);
  });
});

/**
 * BODA-28 · El paisaje en movimiento
 *
 * LO QUE SE PRUEBA NO ES QUE EL VÍDEO SE VEA, sino que la sección lo monta como
 * FONDO y no como reproductor —callado, en bucle, sin controles y sin robar una
 * parada de teclado—, y que **se rinde ante quien ha pedido no ver movimiento**.
 * Un bucle aéreo a pantalla completa es justo lo que marea a esa persona.
 *
 * El fichero no está en el bucket de pruebas: Storage no se siembra. Da igual —
 * lo que se comprueba es la rama y sus atributos, y para eso basta la fila.
 */
test.describe("El paisaje en movimiento", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  test.beforeAll(async () => {
    await fijarFrase(await leerFrase());
  });

  /**
   * CAMINO FELIZ · con movimiento permitido, la sección monta el vídeo.
   */
  test("el vídeo se monta como fondo, no como reproductor", async ({ page }) => {
    await page.goto("/");

    const video = seccion(page).locator("video");
    await expect(video, "con la fila de vídeo publicada tiene que montarse").toHaveCount(1);

    // Callado y en bucle: sin `muted` ningún navegador lo arranca solo.
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    expect(await video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);
    expect(await video.evaluate((v: HTMLVideoElement) => v.autoplay)).toBe(true);

    // Sin controles y fuera del recorrido de teclado: es el fondo, no un
    // reproductor. Una parada de tabulación que no lleva a nada es una parada
    // de más para quien navega con teclado.
    expect(await video.evaluate((v: HTMLVideoElement) => v.controls)).toBe(false);
    await expect(video).toHaveAttribute("tabindex", "-1");

    // Y el póster puesto: es lo que se ve mientras carga y si algo falla.
    const poster = await video.getAttribute("poster");
    expect(poster, "el vídeo tiene que llevar su fotograma quieto").toContain(".jpg");

    // El titular sigue siendo el que cuenta la sección; el vídeo no habla.
    await expect(video).toHaveAttribute("aria-hidden", "true");
    await expect(seccion(page).locator("h2")).toBeVisible();
  });

  /**
   * CASO DE ERROR · quien pide no ver movimiento no ve movimiento.
   */
  test("con «prefers-reduced-motion» no hay vídeo, sino el fotograma quieto", async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ reducedMotion: "reduce" });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto("/");

      await expect(
        seccion(pagina).locator("video"),
        "un bucle de fondo es justo lo que se pidió no ver",
      ).toHaveCount(0);

      // Y en su lugar, el fotograma: la sección no se queda en un hueco.
      const quieta = seccion(pagina).locator("img");
      await expect(quieta).toHaveCount(1);
      expect(
        await quieta.getAttribute("alt"),
        "el fotograma es contenido, no relleno",
      ).toBeTruthy();
    } finally {
      await contexto.close();
    }
  });
});
