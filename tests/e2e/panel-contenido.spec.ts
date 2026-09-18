import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_CONTENIDO, RUTA_PANEL } from "../../src/config/constants";
import { SECCIONES } from "../../src/config/secciones";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-128 · El interruptor de las secciones de la landing
 *
 * LO QUE HAY QUE DEMOSTRAR NO ES QUE EL BOTÓN CAMBIE DE RÓTULO, sino que la web
 * pública obedece. `secciones_landing` llevaba desde el primer día decidiendo
 * qué se enseña, con su `grant update` y su política puestos y sin una sola
 * pantalla detrás; un test que mirase sólo el panel daría por bueno justo el
 * fallo que este ticket viene a cerrar.
 *
 * Por eso cada paso se comprueba en tres sitios: la decisión del servidor, la
 * base de datos y la landing. Con RLS de por medio esto no es celo: una
 * escritura prohibida no da error, devuelve cero filas, y sin mirar la base un
 * «ya se ve en la web» puede ser mentira.
 *
 * EL ORDEN SE RESTAURA PASE LO QUE PASE. Sin ese `afterAll`, un fallo aquí deja
 * la landing en un orden distinto y los specs que corren después fallan por un
 * motivo que no tiene nada que ver con lo que están probando. Y se restaura
 * dentro de UNA transacción, porque la unicidad de `orden` es diferida: fila a
 * fila, la primera escritura ya deja dos secciones con el mismo número.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión, y sin servidor de autenticación no hay pantalla que ver.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

/** La que se enciende y se apaga. No la mira ningún otro spec. */
const SECCION = "preguntas_frecuentes";

/** Lo que se afirma cuando la acción no dejó ningún destino: falla y se lee. */
const SIN_DESTINO = "(la acción no redirigió)";

test.describe.configure({ mode: "serial" });

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

interface FilaSeccion {
  seccion: string;
  visible: boolean;
  orden: number;
}

function leerSecciones(): Promise<FilaSeccion[]> {
  return conBase(
    (sql) => sql<FilaSeccion[]>`
      select seccion, visible, orden from public.secciones_landing order by orden
    `,
  );
}

async function entrar(pagina: Page) {
  // Se engancha ANTES de la primera navegación: lo que hace falta saber es a
  // dónde dijo la acción que fuera, y eso sólo se ve escuchando desde el
  // principio.
  seguirLaPista(pagina);
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

/**
 * ESPERA A QUE LA ACCIÓN HAYA DECIDIDO, Y DEJA LA PANTALLA EN SU DESTINO.
 *
 * Es la misma pieza que ya usan `panel-medios` y `panel-proveedores`, y por el
 * mismo motivo: #126. El servidor responde con su `x-action-redirect`
 * —`/panel/contenido?estado=ocultada`— y el enrutador de cliente no siempre lo
 * aplica, así que afirmar sobre `role="status"` directamente después del clic
 * falla con «element(s) not found» aunque la acción haya ido perfecta. Pasó en
 * la primera ejecución de este spec en CI.
 *
 * NO ES AFLOJAR EL TEST, Y LA DIFERENCIA IMPORTA:
 *
 *   · se sigue exigiendo el estado EXACTO —`ocultada` y no `sin-permiso`—, que
 *     es el diagnóstico entero cuando algo falla;
 *   · se sigue exigiendo todo lo de después: el aviso en pantalla, lo que dice
 *     la base y lo que la landing pinta;
 *   · lo único que deja de afirmarse es que el navegador aplique SOLO la
 *     redirección. Eso es #126, tiene su incidencia y su rastro, y no es lo que
 *     BODA-128 viene a probar.
 */
async function esperarEstado(pagina: Page, esperado: string) {
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
  // Consumido: el destino de esta acción no puede valer por el de la siguiente.
  olvidarDestinos(pagina);

  // Y se va al destino SIEMPRE, aunque la barra ya lo lleve puesto: un rescate
  // anterior deja esa misma dirección, y «ya estoy ahí» acabaría mirando la
  // pantalla de hace dos pasos, sin lo que se acaba de escribir.
  await pagina.goto(destino ?? `${RUTA_CONTENIDO}?${destinoEsperado}`);
  await pagina.waitForLoadState("networkidle");
}

/** La ficha de una sección, localizada por su nombre y no por su posición. */
function fichaDe(pagina: Page, nombre: string) {
  return pagina
    .getByRole("listitem")
    .filter({ has: pagina.getByRole("heading", { name: nombre }) });
}

const nombreDe = (seccion: string) =>
  copy.navegacion.secciones[seccion as keyof typeof copy.navegacion.secciones];

test.describe("El contenido de la web", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: sólo corre en el trabajo de CI que lo levanta.",
  );

  let original: FilaSeccion[] = [];

  test.beforeAll(async () => {
    original = await leerSecciones();
  });

  test.afterAll(async () => {
    if (original.length === 0) return;
    await conBase((sql) =>
      sql.begin(async (tx) => {
        for (const fila of original) {
          await tx`
            update public.secciones_landing
               set visible = ${fila.visible}, orden = ${fila.orden}
             where seccion = ${fila.seccion}::public.seccion_landing
          `;
        }
      }),
    );
  });

  test("apagar una sección la quita de la web, y encenderla la devuelve", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    const nombre = nombreDe(SECCION);
    await expect(fichaDe(page, nombre)).toBeVisible();

    // De partida está encendida y con contenido, así que la web la enseña.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: copy.preguntas.titulo, exact: true }),
    ).toBeVisible();

    // --- apagar -------------------------------------------------------------
    await page.goto(RUTA_CONTENIDO);
    await fichaDe(page, nombre)
      .getByRole("button", { name: copy.panel.contenido.ocultar })
      .click();

    await esperarEstado(page, "ocultada");
    await expect(page.getByRole("status")).toHaveText(copy.panel.contenido.avisoOcultada);

    const apagada = (await leerSecciones()).find((fila) => fila.seccion === SECCION);
    expect(apagada?.visible, "la base es la que manda, no el aviso").toBe(false);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: copy.preguntas.titulo, exact: true }),
    ).toHaveCount(0);

    // --- y volver a encender ------------------------------------------------
    await page.goto(RUTA_CONTENIDO);
    await fichaDe(page, nombre)
      .getByRole("button", { name: copy.panel.contenido.mostrar })
      .click();

    await esperarEstado(page, "mostrada");
    await expect(page.getByRole("status")).toHaveText(copy.panel.contenido.avisoMostrada);

    const encendida = (await leerSecciones()).find((fila) => fila.seccion === SECCION);
    expect(encendida?.visible).toBe(true);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: copy.preguntas.titulo, exact: true }),
    ).toBeVisible();
  });

  test("bajar una sección la permuta con la de abajo, y subirla la devuelve", async ({
    page,
  }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    const antes = await leerSecciones();
    const primera = antes[0];
    const segunda = antes[1];
    const nombrePrimera = nombreDe(primera.seccion);

    await fichaDe(page, nombrePrimera)
      .getByRole("button", { name: copy.panel.contenido.bajarOrden })
      .click();

    await esperarEstado(page, "movida");
    await expect(page.getByRole("status")).toHaveText(copy.panel.contenido.avisoMovida);

    const despues = await leerSecciones();
    expect(
      despues.map((fila) => fila.seccion).slice(0, 2),
      "la permuta tiene que estar en la base, no sólo en la pantalla",
    ).toEqual([segunda.seccion, primera.seccion]);

    // Los dos números son los de antes, intercambiados: no se han inventado
    // huecos nuevos ni se ha renumerado la lista entera.
    expect(despues.map((fila) => fila.orden)).toEqual(antes.map((fila) => fila.orden));

    // --- y de vuelta --------------------------------------------------------
    await fichaDe(page, nombrePrimera)
      .getByRole("button", { name: copy.panel.contenido.subirOrden })
      .click();

    await esperarEstado(page, "movida");

    const restaurado = await leerSecciones();
    expect(restaurado.map((fila) => fila.seccion)).toEqual(antes.map((fila) => fila.seccion));
  });

  test("la primera no se puede subir y la última no se puede bajar", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    const filas = await leerSecciones();
    const primera = fichaDe(page, nombreDe(filas[0].seccion));
    const ultima = fichaDe(page, nombreDe(filas[filas.length - 1].seccion));

    // `toBeVisible()` antes de contar: `toHaveCount` reintenta, pero sobre un
    // ámbito que todavía no existe contaría cero y pasaría por el motivo malo.
    await expect(primera).toBeVisible();
    await expect(ultima).toBeVisible();

    await expect(
      primera.getByRole("button", { name: copy.panel.contenido.subirOrden }),
      "un botón que no lleva a ningún sitio no se pinta",
    ).toHaveCount(0);
    await expect(
      primera.getByRole("button", { name: copy.panel.contenido.bajarOrden }),
    ).toHaveCount(1);

    await expect(
      ultima.getByRole("button", { name: copy.panel.contenido.bajarOrden }),
    ).toHaveCount(0);
    await expect(
      ultima.getByRole("button", { name: copy.panel.contenido.subirOrden }),
    ).toHaveCount(1);
  });

  test("están las dieciséis, y se dice cuál no aparece aunque esté encendida", async ({
    page,
  }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    await expect(page.getByRole("listitem").first()).toBeVisible();
    await expect(
      page.getByRole("listitem"),
      "una sección que no salga aquí es una sección que nadie puede encender",
    ).toHaveCount(SECCIONES.length);

    /*
      `ubicaciones` está encendida desde el primer día y no existe: no hay
      componente que la pinte (BODA-26). Es el caso que convierte esta pantalla
      en algo más que un interruptor — sin decirlo, alguien la enciende, no pasa
      nada, y no hay forma de saber por qué.
    */
    await expect(fichaDe(page, copy.navegacion.secciones.ubicaciones)).toContainText(
      copy.panel.contenido.sinHacer,
    );
  });
});
