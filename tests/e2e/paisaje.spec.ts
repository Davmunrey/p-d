import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

/**
 * BODA-27 · Paisaje · BODA-117 · La escena de la entrega
 *
 * LAS TRES LÍNEAS SALEN DE LA BASE, NO DEL CÓDIGO, y eso es lo que se prueba: no
 * que aparezca un texto, sino que **cambiarlo en la base lo cambia en la web**.
 * Un texto escrito en el JSX pasaría cualquier comprobación de «se ve algo» y
 * obligaría a un despliegue para corregir una ciudad mal puesta.
 *
 * Y QUE SIN TITULAR NO HAY SECCIÓN. Una vista aérea muda es un fondo bonito que
 * no dice nada; antes ocultarla que dejar media sección. La versalita y el
 * cierre sí son opcionales una a una, y la foto tampoco manda: sin ella la
 * sección se sostiene sobre el plano de marca que pinta la propia entrega.
 *
 * LA ESCENA SE MIDE, NO SE MIRA. La sección de la entrega dura tres pantallas
 * de scroll: el marco se abre de un recuadro centrado a pantalla completa y la
 * frase entra a mitad de recorrido. Aquí se coloca el scroll en un punto
 * concreto del recorrido y se leen los valores calculados, que es la única
 * forma de afirmar que la escena avanza de verdad y no que existe una clase.
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

/** ¿Sabe este navegador atar una animación al scroll? Si no, no hay escena. */
function hayEscena(pagina: Page) {
  return pagina.evaluate(() => CSS.supports("animation-timeline: view()"));
}

/**
 * Deja el scroll en el punto `p` del recorrido de la escena, con la misma
 * cuenta que hace el navegador: cero cuando el borde de arriba de la sección
 * toca el de la pantalla, uno cuando el de abajo la alcanza.
 */
async function colocarEscena(pagina: Page, p: number) {
  await pagina.evaluate((parte) => {
    const escena = document.querySelector("#paisaje")!;
    const caja = escena.getBoundingClientRect();
    const arriba = caja.top + window.scrollY;
    const recorrido = caja.height - window.innerHeight;
    /*
      `behavior: "instant"` Y NO EL `scrollTo(x, y)` DE SIEMPRE. La hoja base
      pone `scroll-behavior: smooth` en el documento entero, así que un scroll
      pedido desde JavaScript viaja durante varios cientos de milisegundos: se
      medía la escena a mitad de camino y siempre salía como al principio.
    */
    window.scrollTo({ top: arriba + recorrido * parte, behavior: "instant" });
  }, p);
  // Dos fotogramas para que el navegador recalcule la línea de tiempo.
  await pagina.evaluate(
    () => new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo))),
  );
}

/** Los cuatro números que describen el estado de la escena en este momento. */
function medirEscena(pagina: Page) {
  return pagina.evaluate(() => {
    const recorte = (selector: string) => {
      const valor = getComputedStyle(document.querySelector(selector)!).clipPath;
      // `inset(27% 30% round 4px)` → el primer porcentaje, que es lo que mide
      // cuánto le falta al marco para abrirse del todo.
      const numero = valor.match(/[\d.]+%/);
      return numero ? Number.parseFloat(numero[0]) : 0;
    };

    return {
      recorteMarco: recorte(".marco-paisaje"),
      opacidadTexto: Number(
        getComputedStyle(document.querySelector(".texto-paisaje")!).opacity,
      ),
      opacidadPista: Number(
        getComputedStyle(document.querySelector(".pista-paisaje")!).opacity,
      ),
    };
  });
}

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

    // Y el cierre de la entrega, que es lo que invita a seguir bajando.
    await expect(seccion(page)).toContainText(copy.paisaje.seguidBajando);
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
 * BODA-117 · La escena
 *
 * Tres pantallas de alto, un panel pegado dentro, y un marco que se abre
 * mientras se baja. Se mide colocando el scroll en puntos concretos del
 * recorrido y leyendo los valores calculados.
 */
test.describe("La escena del paisaje", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("la sección dura tres pantallas y su panel se queda pegado", async ({ page }) => {
    test.skip(!(await hayEscena(page)), "Este navegador no ata animaciones al scroll.");

    const medidas = await seccion(page).evaluate((nodo) => ({
      alto: nodo.getBoundingClientRect().height,
      ventana: window.innerHeight,
      panel: getComputedStyle(nodo.querySelector(".panel-paisaje")!).position,
      relleno: getComputedStyle(nodo).paddingTop,
    }));

    // Tres pantallas, con margen para el redondeo de las unidades dinámicas.
    expect(medidas.alto).toBeGreaterThan(medidas.ventana * 2.5);
    expect(medidas.panel).toBe("sticky");
    // Sin relleno propio: el aire de esta sección lo pone su contenido dentro.
    expect(medidas.relleno).toBe("0px");
  });

  /**
   * CAMINO FELIZ · al principio del recorrido el marco es un recuadro pequeño y
   * la frase todavía no está; al final está abierto del todo y la frase se lee.
   */
  test("el marco se abre y la frase entra a mitad de recorrido", async ({ page }) => {
    test.skip(!(await hayEscena(page)), "Este navegador no ata animaciones al scroll.");

    await colocarEscena(page, 0);
    const alEmpezar = await medirEscena(page);

    // El recuadro de la entrega recorta un 27 % por arriba y por abajo.
    expect(alEmpezar.recorteMarco).toBeGreaterThan(20);
    expect(alEmpezar.opacidadTexto).toBeLessThan(0.05);
    expect(alEmpezar.opacidadPista, "la pista llama al principio").toBeGreaterThan(0.9);

    await colocarEscena(page, 0.9);
    const alAcabar = await medirEscena(page);

    expect(alAcabar.recorteMarco, "el marco acaba a pantalla completa").toBeLessThan(1);
    expect(alAcabar.opacidadTexto, "y la frase, a la vista").toBeGreaterThan(0.95);
    expect(alAcabar.opacidadPista, "la pista ya ha cumplido").toBeLessThan(0.05);
  });

  /**
   * CASO DE ERROR · la escena no puede provocar saltos de maquetación.
   *
   * La entrega abre el marco animando `width` y `height`, que obliga a
   * recalcular la maquetación en cada fotograma. Aquí se abre recortando, y eso
   * es lo que se afirma: que la caja del marco mide lo mismo al principio y al
   * final del recorrido, aunque lo que se vea sea distinto.
   */
  test("el marco no cambia de tamaño: se abre recortando", async ({ page }) => {
    test.skip(!(await hayEscena(page)), "Este navegador no ata animaciones al scroll.");

    const caja = () =>
      page.locator(".marco-paisaje").evaluate((nodo) => {
        const { width, height } = nodo.getBoundingClientRect();
        return { ancho: Math.round(width), alto: Math.round(height) };
      });

    await colocarEscena(page, 0);
    const alEmpezar = await caja();

    await colocarEscena(page, 0.9);
    const alAcabar = await caja();

    expect(alAcabar).toEqual(alEmpezar);
  });
});

/**
 * CASO DE ERROR · quien pide no ver movimiento no ve escena.
 *
 * Ni las tres pantallas de scroll ni la frase escondida esperando a que alguien
 * baje: la sección mide lo que medía y se lee entera desde el primer momento.
 */
test.describe("El paisaje con movimiento reducido", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  test("no hay escena y la frase se lee sin hacer scroll", async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: "reduce" });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto("/");
      await pagina.waitForLoadState("networkidle");

      const medidas = await seccion(pagina).evaluate((nodo) => ({
        alto: nodo.getBoundingClientRect().height,
        ventana: window.innerHeight,
        opacidadTexto: Number(getComputedStyle(nodo.querySelector(".texto-paisaje")!).opacity),
        recorte: getComputedStyle(nodo.querySelector(".marco-paisaje")!).clipPath,
      }));

      expect(medidas.alto, "sin escena, la sección no dura tres pantallas").toBeLessThan(
        medidas.ventana * 2,
      );
      expect(medidas.opacidadTexto, "la frase está a la vista desde el principio").toBe(1);
      expect(medidas.recorte, "y el marco se ve entero").toBe("none");
    } finally {
      await contexto.close();
    }
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
