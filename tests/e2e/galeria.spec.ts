import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

/**
 * BODA-25 · La galería y su visor
 *
 * LOS DATOS SE METEN POR SQL Y NO POR EL PANEL. Lo que se prueba aquí es que la
 * LANDING obedece a la tabla `medios`: qué sale, qué se calla y qué hace al
 * pulsarlo. Pasar por el gestor de medios mezclaría dos cosas y, el día que
 * fallara, no diría cuál de las dos se ha roto — para eso está
 * `panel-medios.spec.ts`.
 *
 * LAS FOTOS SON FILAS SIN FICHERO DETRÁS, y da igual: en CI el objeto no existe
 * en Storage y los `<img>` fallan al cargar. Aquí se afirman elementos y
 * atributos —que la miniatura está, que enlaza a su fichero, que el visor se
 * abre y navega—, nunca píxeles.
 *
 * TODO LO QUE SE INSERTA SE BORRA EN UN `afterAll`, que corre también cuando el
 * test falla. Sin eso, una prueba rota deja fotos de mentira publicadas en la
 * web de la boda.
 */

const CADENA = process.env.DATABASE_URL;

/** Lo que lleva todo lo nuestro, para reconocerlo y para poder borrarlo. */
const MARCA = "(DES) E2E Galeria";

/**
 * EL SELLO ES DE ESTA EJECUCIÓN, Y ESO NO ES COSMÉTICA.
 *
 * El trabajo de CI corre la suite en `escritorio` y en `movil` a la vez, y los
 * dos apuntan a la MISMA base. Con una limpieza por `like '(DES) E2E Galeria%'`,
 * el que acabase primero borraría las fotos del otro a media prueba — y el
 * fallo saldría como «la galería no contiene la foto», que no se parece en nada
 * a lo que habría pasado.
 *
 * Cada proyecto corre en su propio proceso, así que cada uno evalúa este módulo
 * y se queda con su sello. Se siembra con él y se borra por él.
 */
const SELLO = Date.now();

/**
 * LA MARCA NO PUEDE IR EN LA RUTA, y no es un descuido: la comprueba
 * `es_ruta_almacenamiento_valida`, que sólo admite `[A-Za-z0-9._/-]`. Ni
 * paréntesis ni espacios. Así que la ruta lleva su propia versión sin adornos
 * —basta para reconocerla en el HTML— y la marca de verdad viaja en el texto
 * alternativo, que es además por donde se limpia.
 */
const PREFIJO_RUTA = `galeria/e2e-galeria-${SELLO}`;

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(CADENA!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

interface Sembrado {
  /** Publicada y medida: tiene que salir. */
  primera: string;
  /** La segunda publicada, para que haya a dónde navegar con las flechas. */
  segunda: string;
  /** En borrador: no sale de ninguna manera. */
  borrador: string;
  /** Publicada pero SIN medidas: tampoco entra en la rejilla. */
  sinMedidas: string;
}

/**
 * Deja en la base los cuatro casos que importan y devuelve cómo reconocerlos.
 *
 * El texto alternativo es el identificador: es lo que acaba en el `alt` del
 * `<img>`, en el nombre accesible del enlace y en el pie del visor, así que
 * sirve para buscarlo en pantalla y para descartarlo del HTML.
 */
async function sembrar(): Promise<Sembrado> {
  const datos: Sembrado = {
    primera: `${MARCA} primera ${SELLO}`,
    segunda: `${MARCA} segunda ${SELLO}`,
    borrador: `${MARCA} borrador ${SELLO}`,
    sinMedidas: `${MARCA} sin medidas ${SELLO}`,
  };

  await conBase(async (sql) => {
    await sql`
      insert into public.medios
        (ruta_almacenamiento, texto_alternativo, seccion, tipo, orden, ancho, alto, publicado)
      values
        (${`${PREFIJO_RUTA}-primera.jpg`},
         ${sql.json({ es: datos.primera })}, 'galeria', 'imagen', 900, 1600, 1067, true),
        (${`${PREFIJO_RUTA}-segunda.jpg`},
         ${sql.json({ es: datos.segunda })}, 'galeria', 'imagen', 901, 1200, 1600, true),
        (${`${PREFIJO_RUTA}-borrador.jpg`},
         ${sql.json({ es: datos.borrador })}, 'galeria', 'imagen', 902, 1600, 1067, false),
        (${`${PREFIJO_RUTA}-sin-medidas.jpg`},
         ${sql.json({ es: datos.sinMedidas })}, 'galeria', 'imagen', 903, null, null, true)
    `;
  });

  return datos;
}

/** Borra SÓLO lo de esta ejecución. Ver el comentario de `SELLO`. */
async function limpiar(): Promise<void> {
  if (!CADENA) return;
  await conBase(async (sql) => {
    await sql`delete from public.medios where ruta_almacenamiento like ${`${PREFIJO_RUTA}%`}`;
  });
}

test.describe("La galería", () => {
  test.skip(
    !CADENA,
    "Necesita la base de datos: solo corre en el trabajo de CI que la levanta.",
  );

  /**
   * SE SIEMBRA UNA VEZ PARA TODA LA TANDA, no una por prueba. Sembrando dentro
   * de cada test, un reintento —en CI hay dos— volvería a insertar las mismas
   * cuatro filas y la galería enseñaría cada foto por duplicado: el fallo
   * saldría como «hay dos miniaturas», que no se parece en nada a lo que habría
   * pasado.
   */
  let datos: Sembrado;

  test.beforeAll(async () => {
    if (!CADENA) return;
    datos = await sembrar();
  });

  test.afterAll(limpiar);

  /**
   * EL CAMINO FELIZ Y LOS DE ERROR VAN JUNTOS A PROPÓSITO. Todos preguntan por
   * la MISMA página, y separarlos costaría cargarla cuatro veces para mirar
   * cuatro veces lo mismo.
   */
  test("las fotos publicadas se ven, se abren y se recorren con las flechas", async ({
    page,
  }) => {
    await page.goto("/");

    const seccion = page.locator("#galeria");
    await expect(seccion).toBeVisible();

    /*
      FELIZ 1 · LA MINIATURA ESTÁ, Y ES UN ENLACE DE VERDAD.

      Que sea un `<a>` con su `href` al fichero es lo que sostiene la promesa de
      que la galería funciona sin JavaScript: si algún día alguien lo convierte
      en un `<button>`, quien tenga el visor apagado se queda sin ver las fotos.
      El nombre accesible sale del texto alternativo, que es lo que oye quien
      navega con lector de pantalla.
    */
    const miniatura = seccion.getByRole("link", { name: datos.primera, exact: true });
    await expect(miniatura).toHaveCount(1);
    await expect(miniatura).toHaveAttribute(
      "href",
      new RegExp(`${PREFIJO_RUTA}-primera\\.jpg$`),
    );

    await expect(seccion.getByRole("link", { name: datos.segunda, exact: true })).toHaveCount(
      1,
    );

    /*
      ERROR 1 · UNA FOTO EN BORRADOR NO EXISTE PARA LA WEB.
      ERROR 2 · UNA FOTO SIN MEDIDAS TAMPOCO ENTRA.

      Se mira el HTML ENTREGADO y no lo que se ve en pantalla: un elemento
      escondido con CSS sigue estando en la fuente, así que `not.toBeVisible()`
      pasaría con el borrador dentro del documento — que es exactamente la fuga
      que hay que descartar.

      La de sin medidas es el caso sutil: está publicada, así que RLS la deja
      salir. La descarta la consulta, porque sin ancho ni alto no se puede
      reservar su hueco y la rejilla daría un salto al cargar.
    */
    const html = await page.content();
    expect(
      html.includes(datos.borrador),
      "una foto sin publicar no puede estar en el HTML",
    ).toBe(false);
    expect(
      html.includes(`${PREFIJO_RUTA}-borrador.jpg`),
      "ni siquiera su ruta puede asomarse",
    ).toBe(false);
    expect(
      html.includes(datos.sinMedidas),
      "una foto sin ancho ni alto no entra en la rejilla",
    ).toBe(false);

    /*
      FELIZ 2 · EL VISOR SE ABRE AL PULSAR, Y NO NAVEGA AL FICHERO.

      El enlace sigue apuntando al fichero: lo que hace el visor es quedarse con
      el clic. Si eso fallara, el navegador saldría de la página y `#galeria`
      dejaría de existir.
    */
    await miniatura.click();

    const visor = page.locator("dialog");
    await expect(visor).toBeVisible();
    await expect(seccion, "el visor no navega: la landing sigue ahí").toBeVisible();

    const fotoDelVisor = visor.locator("figure img");
    await expect(fotoDelVisor).toHaveAttribute("alt", datos.primera);

    /*
      El contador se anuncia solo. Se comprueba la REGIÓN, no su redacción: lo
      que importa para quien no ve la pantalla es que exista algo que el lector
      lea cuando la foto cambia sin que se mueva el foco.
    */
    await expect(visor.locator("[aria-live]")).toHaveText(/\d+/);

    /*
      FELIZ 3 · LAS FLECHAS RECORREN LA GALERÍA.

      Se afirma que la foto CAMBIA y que se vuelve a la de partida, no cuál es
      la siguiente: en CI los dos proyectos siembran a la vez sobre la misma
      base, así que quién está al lado depende de quién insertó antes. Lo que
      tiene que ser cierto pase lo que pase es que ← deshace lo que hizo →.
    */
    await page.keyboard.press("ArrowRight");
    await expect(fotoDelVisor).not.toHaveAttribute("alt", datos.primera);

    await page.keyboard.press("ArrowLeft");
    await expect(fotoDelVisor).toHaveAttribute("alt", datos.primera);

    // Y los botones hacen lo mismo que las flechas, para quien no usa teclado.
    await visor.getByRole("button", { name: copy.galeria.siguiente, exact: true }).click();
    await expect(fotoDelVisor).not.toHaveAttribute("alt", datos.primera);

    await visor.getByRole("button", { name: copy.galeria.anterior, exact: true }).click();
    await expect(fotoDelVisor).toHaveAttribute("alt", datos.primera);

    /*
      FELIZ 4 · ESC CIERRA Y EL FOCO VUELVE A LA MINIATURA.

      Es lo que separa un visor accesible de una trampa: quien navega con
      teclado tiene que salir por donde entró, no al principio del documento —
      donde tendría que volver a recorrer toda la página para seguir donde
      estaba.
    */
    await page.keyboard.press("Escape");
    await expect(visor).toBeHidden();
    await expect(miniatura).toBeFocused();
  });

  /**
   * LA MISMA PREGUNTA, PERO A LA BASE.
   *
   * La landing lee como `anon`, así que lo que decide qué se ve no es el
   * componente: es la política de `medios`. Si alguien la relajara, el HTML
   * seguiría en verde durante un tiempo —porque la consulta también filtra— y
   * la fuga sólo aparecería el día que alguien preguntara por otro camino.
   */
  test("como anon, la foto en borrador no se puede leer ni preguntando a la base", async () => {
    const visibles = (await conBase((sql) =>
      sql.begin(async (tx) => {
        await tx`set local role anon`;
        return tx<{ alternativo: string }[]>`
          select texto_alternativo ->> 'es' as alternativo
            from public.medios
           where ruta_almacenamiento like ${`${PREFIJO_RUTA}%`}
        `;
      }),
    )) as unknown as { alternativo: string }[];

    const alternativos = visibles.map((fila) => fila.alternativo);

    expect(alternativos).toContain(datos.primera);
    expect(alternativos).toContain(datos.segunda);
    expect(alternativos, "el borrador no sale ni por la puerta de atrás").not.toContain(
      datos.borrador,
    );
  });
});
