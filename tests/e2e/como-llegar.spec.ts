import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

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
  test("el mapa se carga al llegar a la sección, no al abrir la portada", async ({ page }) => {
    await fijarCoordenadas(original);
    await page.goto("/");

    const mapa = seccion(page).locator("iframe");
    await expect(mapa).toHaveAttribute("loading", "lazy");

    // Y lleva título: un marco sin él se anuncia como «marco» y nada más.
    await expect(mapa).toHaveAttribute("title", copy.comoLlegar.mapaTitulo);

    // El mapa también sale de la base, no de un punto escrito a mano.
    const guardadas = await leerCoordenadas();
    const fuente = await mapa.getAttribute("src");
    expect(fuente).toContain(String(Number(guardadas.latitud)));
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

    const fuente = await seccion(page).locator("iframe").getAttribute("src");
    expect(fuente, "y el mapa incrustado también").toContain(comoLaBase(otro.latitud));

    // Y nada del punto anterior se queda por ahí.
    expect(destino).not.toContain(String(Number(original.latitud)));
  });

  /**
   * CASO DE ERROR · sin coordenadas, la sección se oculta entera.
   */
  test("sin coordenadas configuradas la sección desaparece", async ({ page }) => {
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
  });
});
