import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_AJUSTES,
  RUTA_CONTENIDO,
  RUTA_PANEL,
} from "../../src/config/constants";
import { CLAVES_LISTA, rutaDeLista } from "../../src/config/contenido-landing";
import { SECCIONES, esAncla, type Seccion } from "../../src/config/secciones";
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

/**
 * LA LISTA DE SECCIONES, Y NO CUALQUIER LISTA DE LA PÁGINA.
 *
 * En esta pantalla hay otra: el menú del panel, que también son `li`. Contando
 * `getByRole("listitem")` a secas salían veintinueve —dieciséis secciones más
 * las trece entradas del menú de escritorio— y el test fallaba por mirar donde
 * no era. Se acota por el nombre accesible que la propia lista lleva.
 */
function laLista(pagina: Page) {
  return pagina.getByRole("list", { name: copy.panel.contenido.listaTitulo });
}

/** La ficha de una sección, localizada por su nombre y no por su posición. */
function fichaDe(pagina: Page, nombre: string) {
  return laLista(pagina)
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

    // Entre las que van en la página: las que son una página aparte no se
    // ordenan, y tienen su propio test.
    const filas = (await leerSecciones()).filter((fila) => esAncla(fila.seccion as Seccion));
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

    await expect(laLista(page).getByRole("listitem").first()).toBeVisible();
    await expect(
      laLista(page).getByRole("listitem"),
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

  /**
   * UNA LISTA SIN ENLACE ES UNA LISTA QUE NO EXISTE. La de «Cómo llegar» —las
   * rutas y la nota del autobús— estuvo hecha y cableada sin que ninguna
   * pantalla llevara a ella: la fila de su sección apunta a Ajustes, porque
   * son las coordenadas las que deciden si sale, y sólo se llegaba tecleando
   * la dirección. Este barrido es el que lo habría cantado.
   */
  test("cada lista de contenido tiene un enlace que lleva a ella", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);
    await expect(laLista(page).getByRole("listitem").first()).toBeVisible();

    const destinos = await laLista(page)
      .getByRole("link")
      .evaluateAll((enlaces) =>
        enlaces.map((enlace) => new URL((enlace as HTMLAnchorElement).href).pathname),
      );
    for (const clave of CLAVES_LISTA) {
      expect(destinos, `ningún enlace lleva a la lista «${clave}»`).toContain(
        rutaDeLista(clave),
      );
    }
  });

  test("«Cómo llegar» lleva a Ajustes y, aparte, a sus rutas", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    const ficha = fichaDe(page, copy.navegacion.secciones.transporte);
    await expect(
      ficha.getByRole("link", {
        name: copy.panel.contenido.seLlenaEn.replace(
          "{donde}",
          copy.panel.contenido.dondeAjustes,
        ),
      }),
    ).toHaveAttribute("href", RUTA_AJUSTES);

    await ficha.getByRole("link", { name: copy.panel.contenido.rutasEnContenido }).click();
    await expect(page).toHaveURL(new RegExp(`${rutaDeLista("transporte")}$`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: copy.panel.contenido.listas.transporte.titulo,
      }),
    ).toBeVisible();
  });

  /**
   * CASO DE ERROR · la víspera y el día son la misma pantalla en dos pestañas.
   * El enlace de la víspera abría la del día, y quien entraba a escribir la
   * preboda lo hacía, sin darse cuenta, en el programa de la boda.
   */
  test("la víspera se llena en su pestaña, no en la del día", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    await fichaDe(page, copy.navegacion.secciones.preboda)
      .getByRole("link", {
        name: copy.panel.contenido.seLlenaEn.replace(
          "{donde}",
          copy.panel.contenido.dondeContenido,
        ),
      })
      .click();

    const pestanas = page.getByRole("navigation", {
      name: copy.panel.contenido.listas.programa.titulo,
    });
    await expect(
      pestanas.getByRole("link", { name: copy.panel.contenido.listas.programa.preboda }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      pestanas.getByRole("link", { name: copy.panel.contenido.listas.programa.boda }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  /**
   * «Reservad la fecha» es una página aparte: su sitio en la lista no cambia
   * nada en la web. Sus flechas decían «Orden cambiado» sin mover nada.
   */
  test("una sección que es una página aparte no ofrece flechas", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_CONTENIDO);

    const aparte = SECCIONES.filter((seccion) => !esAncla(seccion));
    expect(aparte.length).toBeGreaterThan(0);
    for (const seccion of aparte) {
      const ficha = fichaDe(page, nombreDe(seccion));
      await expect(ficha).toBeVisible();
      await expect(
        ficha.getByRole("button", { name: copy.panel.contenido.subirOrden }),
      ).toHaveCount(0);
      await expect(
        ficha.getByRole("button", { name: copy.panel.contenido.bajarOrden }),
      ).toHaveCount(0);
      // Y se sigue pudiendo encender y apagar.
      await expect(
        ficha.getByRole("button", {
          name: new RegExp(`${copy.panel.contenido.ocultar}|${copy.panel.contenido.mostrar}`),
        }),
      ).toHaveCount(1);
    }
  });

  /**
   * CASO DE ERROR · encender una sección que no tiene con qué pintarse no
   * puede acabar en «Ya se ve en la web». `ubicaciones` está encendida de
   * fábrica y no existe (BODA-26): se apaga y se enciende, y se deja como
   * estaba pase lo que pase.
   */
  test("encender una sección que no puede salir no dice que ya se ve", async ({ page }) => {
    const [{ visible: antes }] = await conBase(
      (sql) => sql<{ visible: boolean }[]>`
        select visible from public.secciones_landing where seccion = 'ubicaciones'
      `,
    );
    try {
      await conBase(
        (sql) =>
          sql`update public.secciones_landing set visible = false where seccion = 'ubicaciones'`,
      );
      await entrar(page);
      await page.goto(RUTA_CONTENIDO);

      const nombre = copy.navegacion.secciones.ubicaciones;
      await fichaDe(page, nombre)
        .getByRole("button", { name: new RegExp(copy.panel.contenido.mostrar) })
        .click();

      await expect(page.getByRole("status")).toHaveText(
        copy.panel.contenido.avisoMostradaSinContenido.replace("{seccion}", nombre),
      );
    } finally {
      await conBase(
        (sql) =>
          sql`update public.secciones_landing set visible = ${antes} where seccion = 'ubicaciones'`,
      );
    }
  });
});
