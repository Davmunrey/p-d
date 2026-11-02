import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

/**
 * BODA-27 · Paisaje · de dónde vienen los novios, en una frase
 *
 * LAS TRES LÍNEAS SALEN DE LA BASE, NO DEL CÓDIGO, y eso es lo que se prueba: no
 * que aparezca un texto, sino que **cambiarlo en la base lo cambia en la web**.
 * Un texto escrito en el JSX pasaría cualquier comprobación de «se ve algo» y
 * obligaría a un despliegue para corregir una ciudad mal puesta.
 *
 * Y QUE SIN TITULAR NO HAY SECCIÓN. Una vista aérea muda es un fondo bonito que
 * no dice nada; antes ocultarla que dejar media sección. La versalita y el
 * cierre sí son opcionales una a una, y la foto tampoco manda: sin ella la
 * sección se sostiene sobre el cielo de la noche.
 *
 * Y QUE YA NO ES UNA ESCENA. Antes duraba tres pantallas de scroll; ahora es
 * una frase y, si hay, una franja de foto. Se mide lo que ocupa de verdad.
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

interface Lineas {
  intro: string | null;
  titulo: string | null;
  cierre: string | null;
}

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

async function leerLineas(): Promise<Lineas> {
  const [fila] = await conBase(
    (sql) => sql<
      {
        paisaje_intro: string | null;
        paisaje_titulo: string | null;
        paisaje_cierre: string | null;
      }[]
    >`
      select paisaje_intro, paisaje_titulo, paisaje_cierre
        from public.configuracion_boda
       limit 1
    `,
  );
  return {
    intro: fila.paisaje_intro,
    titulo: fila.paisaje_titulo,
    cierre: fila.paisaje_cierre,
  };
}

async function fijarLineas(lineas: Lineas): Promise<void> {
  await conBase(
    (sql) => sql`
      update public.configuracion_boda
         set paisaje_intro  = ${lineas.intro},
             paisaje_titulo = ${lineas.titulo},
             paisaje_cierre = ${lineas.cierre}
    `,
  );
}

const seccion = (pagina: Page) => pagina.locator("#paisaje");

test.describe("El paisaje", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  /** Se devuelve la boda a como estaba, pase lo que pase. */
  let original: Lineas;

  test.beforeAll(async () => {
    original = await leerLineas();
  });

  test.afterAll(async () => {
    await fijarLineas(original);
  });

  /**
   * CAMINO FELIZ · las tres líneas de la base son las que se ven.
   */
  test("las tres líneas que hay en la base son las que aparecen", async ({ page }) => {
    await fijarLineas(original);
    await page.goto("/");

    const guardadas = await leerLineas();
    expect(
      guardadas.titulo,
      "el seed tiene que traer un titular para poder probar esto",
    ).toBeTruthy();

    await expect(seccion(page)).toBeVisible();
    for (const linea of [guardadas.intro, guardadas.titulo, guardadas.cierre]) {
      if (linea) await expect(seccion(page)).toContainText(linea);
    }

    // El titular es el `h2`: es lo que la sección dice y lo que le da nombre.
    await expect(seccion(page).locator("h2")).toHaveText(guardadas.titulo!);
  });

  /**
   * CASO DE ERROR · cambiarlas en la base las cambia en la web.
   *
   * Es la comprobación que de verdad descarta el literal: un texto escrito en
   * el código pasaría el camino feliz —coincidiría con el seed— y sólo falla
   * aquí.
   */
  test("cambiar las líneas en la base las cambia en la web", async ({ page }) => {
    const otras = {
      intro: "(DES) Vino de un sitio",
      titulo: "(DES) y fue a parar a otro",
      cierre: "(DES) y ahí se queda",
    };
    await fijarLineas(otras);

    await page.goto("/");

    for (const linea of Object.values(otras)) {
      await expect(seccion(page)).toContainText(linea);
    }
    await expect(seccion(page), "y las anteriores ya no están").not.toContainText(
      original.titulo!,
    );
  });

  /**
   * CASO DE ERROR · la versalita y el cierre son opcionales; el titular no.
   */
  test("sin versalita ni cierre la sección se sostiene con el titular", async ({ page }) => {
    await fijarLineas({ intro: null, titulo: "(DES) Sólo el titular", cierre: null });

    await page.goto("/");

    await expect(seccion(page)).toBeVisible();
    await expect(seccion(page).locator("h2")).toHaveText("(DES) Sólo el titular");
    // Ni una línea vacía colgando: lo que no hay, no se pinta.
    await expect(seccion(page).locator(".texto-paisaje p")).toHaveCount(0);
  });

  /**
   * CASO DE ERROR · sin titular, no hay sección.
   */
  test("sin titular configurado la sección desaparece", async ({ page }) => {
    await fijarLineas({ intro: original.intro, titulo: null, cierre: original.cierre });

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
   * LA FOTO NO MANDA. Lo que se afirma es que el titular no depende de ella: la
   * sección se ve igual, con su frase, sobre el plano de marca.
   */
  test("sin foto la sección se sostiene igual", async ({ page }) => {
    await fijarLineas(original);
    await page.goto("/");

    await expect(seccion(page)).toBeVisible();
    await expect(seccion(page).locator("h2")).toHaveText(original.titulo!);
  });
});

/**
 * YA NO ES UNA ESCENA DE TRES PANTALLAS
 *
 * Era lo más largo de la landing: tres pantallas de scroll con un marco que se
 * abría. Ahora es una frase sobre el cielo y, si hay foto, una franja
 * apaisada. Se mide lo que ocupa, en un móvil, que es donde más se notaba.
 */
test.describe("El paisaje, en una frase", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  test("cabe en una pantalla de móvil y la frase está a la vista sin esperar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await seccion(page).scrollIntoViewIfNeeded();

    const medidas = await seccion(page).evaluate((nodo) => ({
      alto: nodo.getBoundingClientRect().height,
      ventana: window.innerHeight,
      pegado: [...nodo.querySelectorAll("*")].some(
        (hijo) => getComputedStyle(hijo).position === "sticky",
      ),
    }));

    expect(medidas.alto, "la frase y su foto no pasan de una pantalla").toBeLessThan(
      medidas.ventana,
    );
    expect(medidas.pegado, "ya no hay ningún panel pegado").toBe(false);
    await expect(seccion(page).locator("h2")).toBeVisible();
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
