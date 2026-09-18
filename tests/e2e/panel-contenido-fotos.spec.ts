import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_CONTENIDO, RUTA_PANEL } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-130 · Las dos listas con foto
 *
 * `hitos_historia` y `alojamientos` son las dos únicas tablas de la landing que
 * llevan `medio_id`, y esa es toda su diferencia con las otras cuatro. Lo que
 * este fichero defiende es justo eso: que la foto se elija bien y, sobre todo,
 * QUE SIN FOTO SIGA FUNCIONANDO. Los dos `left join` de `src/lib/bbdd/landing.ts`
 * son deliberados —la historia se escribe meses antes de escanear las fotos—, y
 * un `join` normal los rompería sin que nadie lo notara hasta que faltara una
 * sección entera en la web.
 *
 * Y LA OTRA MITAD: que una foto EN BORRADOR no se pueda elegir. La landing la
 * descarta en la condición del `join`, así que ofrecerla aquí sería enseñar en
 * el panel una imagen que la web no pinta — la clase de mentira que #163 viene
 * a quitar.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "E2E130";
const SIN_DESTINO = "(la acción no redirigió)";

/** Se apaga y se enciende aquí, así que se restauran las dos al acabar. */
const SECCIONES_TOCADAS = ["historia", "alojamiento"] as const;

const comun = copy.panel.contenido.listas.comun;
const HISTORIA = copy.panel.contenido.listas.historia;
const HOTELES = copy.panel.contenido.listas.alojamientos;

const RUTA_HISTORIA = `${RUTA_CONTENIDO}/historia`;
const RUTA_HOTELES = `${RUTA_CONTENIDO}/alojamientos`;

/**
 * La ruta de una foto en el almacén es ÚNICA (`medios_ruta_unica_idx`), así que
 * cada una de las de prueba lleva la suya. Reusar la de la portada del seed
 * parecía cómodo —la miniatura resolvería— y lo que hacía era chocar con esa
 * unicidad. Que la imagen no exista no importa aquí: lo que se prueba es a qué
 * foto apunta la ficha, no que el almacén la sirva.
 */
const rutaDePrueba = (sufijo: string) => `desarrollo/${MARCA.toLowerCase()}-${sufijo}.jpg`;

const PUBLICADA = `${MARCA} Foto publicada`;
const BORRADOR = `${MARCA} Foto en borrador`;

test.describe.configure({ mode: "serial" });

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Deja una foto de prueba en una sección y devuelve su identificador.
 *
 * EL TEXTO ALTERNATIVO SE COMPONE EN SQL, con `jsonb_build_object`, y no
 * pasando un JSON ya hecho. Es lo que costó una vuelta de CI: `${JSON.stringify(
 * …)}::jsonb` en postgres.js llega DOBLE CODIFICADO —un texto JSON, no un
 * objeto—, así que `validar_texto_alternativo_medio()` no encuentra la clave del
 * idioma y salta con MED01. Compuesto en la propia consulta no hay forma de que
 * el tipo se pierda por el camino.
 *
 * Y EL ORDEN NO SE PASA: lo pone `medios_asignar_orden` con el siguiente libre
 * de esa sección. Escribirlo a mano chocaba con `medios_orden_unico_por_seccion`
 * en cuanto había dos fotos de prueba, que es lo que pasa aquí.
 */
function crearFoto(
  seccion: string,
  sufijo: string,
  alternativo: string,
  publicada: boolean,
): Promise<string> {
  return conBase(async (sql) => {
    const [fila] = await sql<{ id: string }[]>`
      insert into public.medios
        (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado)
      values (
        ${rutaDePrueba(sufijo)}, jsonb_build_object('es', ${alternativo}::text),
        ${seccion}::public.seccion_landing, 'imagen'::public.tipo_medio, ${publicada}
      )
      returning id
    `;
    return fila.id;
  });
}

interface FilaConFoto {
  id: string;
  nombre: string;
  medio_id: string | null;
}

function leerHoteles(): Promise<FilaConFoto[]> {
  return conBase(
    (sql) => sql<FilaConFoto[]>`
      select id, nombre, medio_id from public.alojamientos
       where nombre like ${`${MARCA}%`} order by orden
    `,
  );
}

function leerHitos(): Promise<{ id: string; titulo: string; medio_id: string | null }[]> {
  return conBase(
    (sql) => sql<{ id: string; titulo: string; medio_id: string | null }[]>`
      select id, titulo, medio_id from public.hitos_historia
       where titulo like ${`${MARCA}%`} order by orden
    `,
  );
}

function limpiar(): Promise<void> {
  return conBase(async (sql) => {
    await sql`delete from public.alojamientos where nombre like ${`${MARCA}%`}`;
    await sql`delete from public.hitos_historia where titulo like ${`${MARCA}%`}`;
    // Las fotos las últimas: `medio_id` es `on delete set null`, pero borrarlas
    // antes dejaría las fichas sin foto y el test siguiente miraría otra cosa.
    await sql`delete from public.medios where ruta_almacenamiento like ${`desarrollo/${MARCA.toLowerCase()}-%`}`;
  });
}

function encenderSeccion(seccion: string, visible: boolean): Promise<unknown> {
  return conBase(
    (sql) => sql`
      update public.secciones_landing set visible = ${visible}
       where seccion = ${seccion}::public.seccion_landing
    `,
  );
}

async function entrar(pagina: Page) {
  seguirLaPista(pagina);
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

/** La misma pieza que el resto del panel, y por el mismo motivo: #126. */
async function esperarEstado(pagina: Page, esperado: string, porDefecto: string) {
  const destinoEsperado = `estado=${esperado}`;

  try {
    await expect
      .poll(() => ultimoDestino(pagina) ?? SIN_DESTINO, { timeout: 15_000 })
      .toContain(destinoEsperado);
  } catch (fallo) {
    throw new Error(
      `${(fallo as Error).message}\n\nLo que hizo la pestaña:\n${laPista(pagina)}`,
    );
  }

  const destino = ultimoDestino(pagina);
  olvidarDestinos(pagina);
  await pagina.goto(destino ?? `${porDefecto}?${destinoEsperado}`);
  await pagina.waitForLoadState("networkidle");
}

function formularioDeAlta(pagina: Page): Locator {
  return pagina
    .locator("form")
    .filter({ has: pagina.getByRole("button", { name: comun.anadir, exact: true }) });
}

function fichaDe(pagina: Page, titulo: string, ficha: string): Locator {
  return pagina
    .getByRole("list", { name: titulo })
    .getByRole("listitem")
    .filter({ has: pagina.getByRole("heading", { name: ficha }) });
}

test.describe("Las listas de contenido con foto", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: sólo corre en el trabajo de CI que lo levanta.",
  );

  let publicada = "";

  test.beforeAll(async () => {
    for (const seccion of SECCIONES_TOCADAS) await encenderSeccion(seccion, true);
    await limpiar();
    publicada = await crearFoto("alojamiento", "publicada", PUBLICADA, true);
    await crearFoto("alojamiento", "borrador", BORRADOR, false);
  });

  test.afterAll(async () => {
    await limpiar();
    // A encendidas, que es como nacen en las migraciones. Guardar lo que se
    // encontró haría que un reintento fijara como «original» un estado roto.
    for (const seccion of SECCIONES_TOCADAS) await encenderSeccion(seccion, true);
  });

  test("un hotel con foto sale en la web con su imagen", async ({ page }) => {
    const nombre = `${MARCA} Hotel con foto`;

    await entrar(page);
    await page.goto(RUTA_HOTELES);

    const alta = formularioDeAlta(page);
    await alta.getByLabel(HOTELES.nombre, { exact: true }).fill(nombre);
    await alta.getByLabel(HOTELES.reserva).fill("https://ejemplo.test/reservar");
    await alta.getByRole("radio", { name: PUBLICADA }).check();
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();

    await esperarEstado(page, "creada", RUTA_HOTELES);

    const [hotel] = await leerHoteles();
    expect(hotel, "el hotel tiene que estar en la base").toBeTruthy();
    expect(hotel.medio_id, "y con la foto que se eligió, no con otra").toBe(publicada);

    await page.goto("/");
    const tarjeta = page
      .locator("#alojamiento li")
      .filter({ has: page.getByRole("heading", { name: nombre }) });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator("img"), "la foto elegida se ve en la web").toHaveCount(1);
  });

  test("y un hito sin foto sale igual, sin hueco", async ({ page }) => {
    /*
      ES EL CASO NORMAL AL PRINCIPIO, no una rareza: la historia se escribe
      meses antes de escanear las fotos. Los `left join` de la landing existen
      por esto, y un `join` normal los rompería sin que nadie lo notara hasta
      que faltase la sección entera.
    */
    const titulo = `${MARCA} Nos conocimos`;

    await entrar(page);
    await page.goto(RUTA_HISTORIA);

    const alta = formularioDeAlta(page);
    await alta.getByLabel(HISTORIA.tituloHito).fill(titulo);
    await alta.getByLabel(HISTORIA.fecha).fill("Mayo de 2019");
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();

    await esperarEstado(page, "creada", RUTA_HISTORIA);

    const [hito] = await leerHitos();
    expect(hito, "el hito tiene que existir").toBeTruthy();
    expect(hito.medio_id, "sin foto es una respuesta, no un fallo").toBeNull();

    await page.goto("/");
    await expect(
      page.locator("#historia").getByRole("heading", { name: titulo }),
      "un hito sin foto sale igual",
    ).toBeVisible();
  });

  test("una foto en borrador no se puede elegir", async ({ page }) => {
    /*
      La landing pide `m.publicado` EN LA CONDICIÓN DEL JOIN, así que un hotel
      con foto en borrador sale sin foto. Ofrecerla aquí enseñaría en el panel
      una imagen que la web no pinta.
    */
    await entrar(page);
    await page.goto(RUTA_HOTELES);

    const alta = formularioDeAlta(page);
    await expect(alta.getByRole("radio", { name: PUBLICADA })).toBeVisible();
    await expect(
      alta.getByRole("radio", { name: BORRADOR }),
      "un borrador no es una foto que se pueda poner en la web",
    ).toHaveCount(0);

    // Y «sin foto» está siempre, que es lo que hace que se pueda no elegir.
    await expect(alta.getByRole("radio", { name: comun.sinFoto })).toBeVisible();
  });

  test("un enlace de reserva mal escrito se rechaza y no guarda nada", async ({ page }) => {
    /*
      `ftp://` Y NO «www.ejemplo.test», y la diferencia es todo el test. El
      `type="url"` del navegador ya para lo que no es una dirección: escribiendo
      «www…» el formulario no llega a enviarse, así que la comprobación del
      SERVIDOR no se ejecuta y el test pasaría sin probar nada. Comprobado en un
      Chromium de verdad: `www.ejemplo.test` lo bloquea y `ftp://…` lo acepta.

      Una dirección `ftp` es además un caso real —se pega lo que hay en el
      portapapeles— y es justo lo que la tabla rechaza con su `CHECK`
      (`url_reserva ~* '^https?://'`). Sin la comprobación de la acción esto
      llegaría a la base, que contestaría con el nombre de la restricción.
    */
    const antes = await leerHoteles();

    await entrar(page);
    await page.goto(RUTA_HOTELES);

    const alta = formularioDeAlta(page);
    await alta.getByLabel(HOTELES.nombre, { exact: true }).fill(`${MARCA} Hotel sin enlace`);
    await alta.getByLabel(HOTELES.reserva).fill("ftp://ejemplo.test/reservar");
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();

    await esperarEstado(page, "enlace", RUTA_HOTELES);

    await expect(
      page.getByText(comun.errorEnlace.replace("{campo}", HOTELES.reserva)),
      "el error va pegado al campo que falla",
    ).toBeVisible();

    expect(await leerHoteles(), "no se guarda nada a medias").toHaveLength(antes.length);
  });

  test("si la foto elegida deja de publicarse, la ficha no la pierde al guardar", async ({
    page,
  }) => {
    /*
      EL DATO QUE SE PERDERÍA SIN MIRAR. Se retira esa imagen desde Fotos y
      vídeos y deja de estar entre las elegibles; si el selector no la
      conservara, abrir la ficha y pulsar «Guardar» la borraría sin avisar.
    */
    const nombre = `${MARCA} Hotel con foto`;
    const [hotel] = await leerHoteles();
    expect(hotel?.medio_id, "este test sigue al del hotel con foto").toBe(publicada);

    await conBase(
      (sql) => sql`update public.medios set publicado = false where id = ${publicada}`,
    );

    await entrar(page);
    await page.goto(RUTA_HOTELES);

    const ficha = fichaDe(page, HOTELES.titulo, nombre);
    // El desplegable de editar. Se abre por su `summary`, como en Fotos y
    // vídeos: el nombre accesible del `details` lleva además el de la ficha.
    await ficha.locator("summary").click();

    const guardar = `${comun.guardar} ${nombre}`;
    const editar = ficha
      .locator("form")
      .filter({ has: page.getByRole("button", { name: guardar, exact: true }) });

    await expect(
      editar.getByRole("radio", { name: comun.fotoActual }),
      "la foto que ya tiene se sigue ofreciendo, aunque ya no esté publicada",
    ).toBeChecked();

    await editar.getByRole("button", { name: guardar, exact: true }).click();
    await esperarEstado(page, "guardada", RUTA_HOTELES);

    const [despues] = await leerHoteles();
    expect(despues.medio_id, "guardar no puede borrar la foto en silencio").toBe(publicada);
  });
});
