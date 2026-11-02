import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { TAMANO_TESELA, URL_TESELAS_MAPA, ZOOM_MAPA_FINAL } from "../../src/config/constants";

/**
 * BODA-26 · Cuándo y dónde: mapa y rutas de llegada
 *
 * LO QUE SE PRUEBA ES QUE EL SITIO SALE DE LA BASE Y NO DEL CÓDIGO. Un enlace
 * de mapa con las coordenadas incrustadas funciona igual de bien el día que se
 * escribe y manda a los invitados a otro pueblo el día que se cambia de finca —
 * y nadie se entera hasta que alguien conduce hasta allí. Por eso el test no
 * mira que el enlace exista: cambia las coordenadas en la base y comprueba que
 * el enlace cambia con ellas.
 *
 * Y QUE SIN COORDENADAS LA SECCIÓN DESAPARECE ENTERA. «Treinta minutos en
 * autobús» sin decir hasta dónde no informa de nada: las rutas describen cómo
 * llegar A un sitio, y sin ese sitio quedan flotando. Antes ocultar que dejar
 * media sección.
 *
 * Corre contra la base real: la landing lee de PostgreSQL directamente, así que
 * aquí no hace falta sesión ni Supabase entero.
 */

const cadena = process.env.DATABASE_URL;

/**
 * TODO EL FICHERO EN SERIE.
 *
 * Los tests de abajo tocan `configuracion_boda`, que es una fila única y
 * compartida por toda la landing. Con `fullyParallel`, otro worker se encuentra
 * la boda sin coordenadas en mitad de su comprobación. Es la misma lección que
 * dejó el spec de «reserva la fecha» al apagar una sección.
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

interface Punto {
  latitud: string | null;
  longitud: string | null;
}

async function leerCoordenadas(): Promise<Punto> {
  const [fila] = await conBase(
    (sql) => sql<Punto[]>`
      select latitud_ceremonia as latitud, longitud_ceremonia as longitud
        from public.configuracion_boda
       limit 1
    `,
  );
  return fila;
}

async function fijarCoordenadas(punto: Punto): Promise<void> {
  await conBase(
    (sql) => sql`
      update public.configuracion_boda
         set latitud_ceremonia  = ${punto.latitud},
             longitud_ceremonia = ${punto.longitud}
    `,
  );
}

/** La sección de «cómo llegar», por su título y nunca por su posición. */
/**
 * La tesela donde cae un punto, contada aquí a mano —la cuenta de cualquier
 * mapa web— y no con la función de la web: si las dos se equivocaran igual,
 * el test lo daría por bueno.
 */
function teselaDe(latitud: number, longitud: number): string {
  const lado = 2 ** ZOOM_MAPA_FINAL;
  const x = Math.floor(((longitud + 180) / 360) * lado);
  const rad = (latitud * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * lado);
  return `${URL_TESELAS_MAPA}/${ZOOM_MAPA_FINAL}/${x}/${y}.png`;
}

function seccion(pagina: Page) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: copy.comoLlegar.titulo }) });
}

test.describe("Cómo llegar", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");

  /** Se devuelve la boda a como estaba, pase lo que pase en el test. */
  let original: Punto;

  test.beforeAll(async () => {
    original = await leerCoordenadas();
  });

  test.afterAll(async () => {
    if (original) await fijarCoordenadas(original);
  });

  /**
   * CAMINO FELIZ · el enlace lleva a las coordenadas que hay en la base.
   */
  test("el enlace del mapa lleva a las coordenadas de la base de datos", async ({ page }) => {
    await fijarCoordenadas(original);
    await page.goto("/");

    const guardadas = await leerCoordenadas();
    const enlace = seccion(page).getByRole("link", { name: copy.comoLlegar.abrirMapa });

    await expect(enlace).toBeVisible();

    /*
      Se comprueban los dos números por separado y no la URL entera: la forma
      del enlace es cosa del proveedor de mapas y puede cambiar sin que cambie
      nada de lo que importa aquí. Lo que no puede cambiar es que las cifras
      sean las de la base.
    */
    const destino = await enlace.getAttribute("href");
    expect(destino, "el enlace tiene que llevar la latitud de la base").toContain(
      String(Number(guardadas.latitud)),
    );
    expect(destino, "y la longitud").toContain(String(Number(guardadas.longitud)));
  });

  /**
   * EL MAPA NO PESA EN LA PORTADA. Se carga al llegar a su sección, y eso lo
   * dice el propio marco: sin `loading="lazy"` el navegador lo pide con el
   * resto de la página, que es lo que este criterio viene a impedir.
   */
  test("el mapa son teselas alrededor del sitio, perezosas y decorativas", async ({ page }) => {
    await fijarCoordenadas(original);
    await page.goto("/");

    const teselas = seccion(page).locator("[data-mapa-del-lugar] img");
    expect(await teselas.count()).toBeGreaterThan(1);
    // Se piden al llegar, no al abrir la portada.
    await expect(teselas.first()).toHaveAttribute("loading", "lazy");
    // Son el fondo: decoración, sin texto alternativo y dentro de algo callado.
    await expect(teselas.first()).toHaveAttribute("alt", "");
    await expect(teselas.first()).toHaveAttribute("width", String(TAMANO_TESELA));

    // Y salen de la base: la tesela donde cae el sitio está entre ellas.
    const guardadas = await leerCoordenadas();
    const centro = teselaDe(Number(guardadas.latitud), Number(guardadas.longitud));
    await expect(seccion(page).locator(`img[src="${centro}"]`)).toHaveCount(1);

    // Ya no hay ningún marco embebido que se quede con el dedo al bajar.
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  /**
   * CASO DE ERROR · cambiar las coordenadas en la base cambia el enlace.
   *
   * Es la comprobación que de verdad descarta el literal incrustado: un enlace
   * escrito a mano pasaría el camino feliz —las cifras coincidirían con el
   * seed— y sólo fallaría aquí.
   */
  test("cambiar las coordenadas en la base cambia el enlace y el mapa", async ({ page }) => {
    // Un punto que no está en el seed y que no se parece a él.
    const otro = { latitud: "43.362343", longitud: "-8.411540" };
    await fijarCoordenadas(otro);

    await page.goto("/");

    /*
      SE COMPARA CONTRA EL NÚMERO, NO CONTRA LO QUE SE ESCRIBIÓ.

      La columna es `numeric`, así que «-8.411540» vuelve de la base como
      «-8.41154»: el cero final no se guarda porque no significa nada. Buscar en
      el enlace la cadena tal cual se tecleó falla por un cero que la pantalla
      hace bien en no pintar.
    */
    const comoLaBase = (valor: string) => String(Number(valor));

    const enlace = seccion(page).getByRole("link", { name: copy.comoLlegar.abrirMapa });
    const destino = await enlace.getAttribute("href");
    expect(destino, "el enlace tiene que seguir a la base").toContain(comoLaBase(otro.latitud));
    expect(destino).toContain(comoLaBase(otro.longitud));

    const centro = teselaDe(Number(otro.latitud), Number(otro.longitud));
    await expect(
      seccion(page).locator(`img[src="${centro}"]`),
      "y el mapa también: la tesela del sitio nuevo",
    ).toHaveCount(1);

    // Y nada del punto anterior se queda por ahí.
    expect(destino).not.toContain(String(Number(original.latitud)));
  });

  /**
   * CASO DE ERROR · sin coordenadas, la sección se oculta entera.
   */
  test("sin coordenadas configuradas la sección desaparece", async ({ page }) => {
    // Primero, con coordenadas, el menú SÍ lleva a «Cómo llegar»: si no, que
    // después no esté no probaría nada.
    const enlaceDelMenu = page.locator('nav a[href="#transporte"]');
    await page.goto("/");
    await expect(enlaceDelMenu.first()).toBeAttached();

    await fijarCoordenadas({ latitud: null, longitud: null });

    await page.goto("/");

    await expect(
      seccion(page),
      "sin sitio al que llegar, la sección no se pinta a medias",
    ).toHaveCount(0);

    /*
      Y no queda el hueco: ni el enlace del menú ni el ancla. Comprobar sólo que
      la sección no está dejaría pasar una navegación que lleva a ningún sitio,
      que es peor que no ofrecerla.
    */
    await expect(page.locator("#transporte")).toHaveCount(0);
    await expect(
      enlaceDelMenu,
      "el menú no puede llevar a una sección que no está",
    ).toHaveCount(0);
  });
});
