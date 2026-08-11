import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * BODA-24 · Nuestra historia
 *
 * La sección ya se pintaba y ya leía de `hitos_historia`, pero no tenía test
 * propio —así que por la regla 4 no estaba entregada— y a cada hito le faltaba
 * su foto.
 *
 * LOS DATOS SE METEN POR SQL Y NO POR EL PANEL. Lo que se prueba aquí es que la
 * LANDING obedece a la tabla: qué sale, en qué orden y qué se calla. Pasar por
 * el panel mezclaría dos cosas y, el día que fallara, no diría cuál de las dos
 * se ha roto.
 *
 * TODO LO QUE SE INSERTA SE BORRA EN UN `afterAll`, que corre también cuando el
 * test falla. Sin eso, una prueba rota deja tres hitos de mentira publicados en
 * la web de la boda.
 */

const CADENA = process.env.DATABASE_URL;

/** Lo que lleva todo lo nuestro, para reconocerlo y para poder borrarlo. */
const MARCA = "(DES) E2E historia";

/**
 * EL SELLO ES DE ESTA EJECUCIÓN, Y ESO NO ES COSMÉTICA.
 *
 * El trabajo de CI corre la suite en `escritorio` y en `movil` a la vez, y los
 * dos apuntan a la MISMA base. Con una limpieza por `like '(DES) E2E
 * historia%'`, el que acabase primero borraría los hitos del otro a media
 * prueba — y el fallo saldría como «la sección no contiene el hito», que no se
 * parece en nada a lo que habría pasado.
 *
 * Cada proyecto corre en su propio proceso, así que cada uno evalúa este módulo
 * y se queda con su sello. Se siembra con él y se borra por él.
 */
const SELLO = Date.now();

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(CADENA!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

interface Sembrado {
  /** Hito publicado con foto publicada: tiene que salir entero. */
  conFoto: string;
  /** Hito publicado cuya foto sigue en borrador: sale él, no la foto. */
  fotoEnBorrador: string;
  /** Hito en borrador: no sale de ninguna manera. */
  enBorrador: string;
  /** El texto alternativo de la foto publicada. */
  alternativoVisible: string;
  /** El de la que no debería verse. */
  alternativoOculto: string;
}

/**
 * Deja en la base los tres casos que importan y devuelve cómo reconocerlos.
 *
 * LAS FOTOS SON FILAS SIN FICHERO DETRÁS, y da igual: lo que se comprueba es
 * qué llega al HTML, y el HTML lleva la URL y el texto alternativo se haya
 * subido el fichero o no. Subir uno de verdad probaría Storage, que es lo que
 * prueba `panel-medios.spec.ts`, no esta sección.
 */
async function sembrar(): Promise<Sembrado> {
  const sello = SELLO;

  const datos: Sembrado = {
    conFoto: `${MARCA} con foto ${sello}`,
    fotoEnBorrador: `${MARCA} foto en borrador ${sello}`,
    enBorrador: `${MARCA} en borrador ${sello}`,
    alternativoVisible: `${MARCA} alternativo visible ${sello}`,
    alternativoOculto: `${MARCA} alternativo oculto ${sello}`,
  };

  await conBase(async (sql) => {
    const [visible] = await sql<{ id: string }[]>`
      insert into public.medios
        (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado)
      values
        (${`historia/e2e-visible-${sello}.jpg`},
         ${sql.json({ es: datos.alternativoVisible })},
         'historia', 'imagen', true)
      returning id
    `;

    const [oculta] = await sql<{ id: string }[]>`
      insert into public.medios
        (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado)
      values
        (${`historia/e2e-oculta-${sello}.jpg`},
         ${sql.json({ es: datos.alternativoOculto })},
         'historia', 'imagen', false)
      returning id
    `;

    await sql`
      insert into public.hitos_historia (titulo, medio_id, orden, publicado)
      values
        (${datos.conFoto},        ${visible.id}, 900, true),
        (${datos.fotoEnBorrador}, ${oculta.id},  901, true),
        (${datos.enBorrador},     null,          902, false)
    `;
  });

  return datos;
}

/** Borra SÓLO lo de esta ejecución. Ver el comentario de `SELLO`. */
async function limpiar(): Promise<void> {
  const mio = `${MARCA}%${SELLO}`;
  await conBase(async (sql) => {
    // Los hitos primero: `medio_id` es una clave ajena.
    await sql`delete from public.hitos_historia where titulo like ${mio}`;
    await sql`delete from public.medios where texto_alternativo->>'es' like ${mio}`;
  });
}

test.describe("Nuestra historia", () => {
  test.skip(
    !CADENA,
    "Necesita la base de datos: solo corre en el trabajo de CI que la levanta.",
  );

  test.afterAll(limpiar);

  /**
   * EL CAMINO FELIZ Y EL DE ERROR VAN JUNTOS A PROPÓSITO. Los dos preguntan por
   * el MISMO HTML, y separarlos costaría sembrar y limpiar dos veces para
   * mirar dos veces la misma página.
   */
  test("los hitos publicados salen con su foto, y los borradores no salen", async ({
    page,
    request,
  }) => {
    const datos = await sembrar();

    await page.goto("/");

    const seccion = page.locator("#historia");
    await expect(seccion).toBeVisible();

    // FELIZ: el hito publicado, con su título y su foto enlazada.
    await expect(seccion.getByText(datos.conFoto)).toBeVisible();
    await expect(
      seccion.locator(`img[alt="${datos.alternativoVisible}"]`),
      "la foto del hito tiene que llegar con su texto alternativo",
    ).toHaveCount(1);

    /*
      ERROR 1: UN HITO EN BORRADOR NO EXISTE PARA LA WEB.

      Se mira el HTML ENTREGADO y no lo que se ve en pantalla. Un elemento
      escondido con CSS sigue estando en la fuente, así que `not.toBeVisible()`
      pasaría con el borrador dentro del documento — que es exactamente la fuga
      que hay que descartar.
    */
    const html = await (await request.get("/")).text();
    expect(
      html.includes(datos.enBorrador),
      "un hito en borrador no puede estar en el HTML",
    ).toBe(false);

    /*
      ERROR 2, EL SUTIL: EL HITO ESTÁ PUBLICADO PERO SU FOTO NO.

      Pasa constantemente —se sube la imagen, se enlaza al hito y se deja para
      revisar— y es el caso que el `left join` tiene que cazar por su cuenta:
      RLS protege `medios` cuando se pregunta por `medios`, pero aquí se
      pregunta por `hitos_historia` y el `join` se lleva lo que encuentre. Lo
      correcto es que salga el hito con su texto y sin imagen.
    */
    expect(
      html.includes(datos.fotoEnBorrador),
      "el hito sí sale: el que está sin publicar es su foto, no él",
    ).toBe(true);
    expect(
      html.includes(datos.alternativoOculto),
      "una foto sin publicar no puede colarse por el hito que la enlaza",
    ).toBe(false);
  });
});
