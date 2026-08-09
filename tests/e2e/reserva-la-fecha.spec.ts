import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { NOMBRE_FICHERO_CALENDARIO, RUTA_CALENDARIO } from "../../src/config/constants";

/**
 * BODA-30 · Reserva la fecha
 *
 * Lo primero que se manda a los invitados. Se comprueba lo mismo de siempre —
 * que los datos salen de la base y no de un literal— y una cosa más que este
 * ticket sí exige: que la página **deje de existir** si se apaga su fila de
 * `secciones_landing`.
 *
 * Ese caso de error se prueba de verdad, apagando el interruptor contra la
 * base real y comprobando el 404. Un test que solo mirara el copy no probaría
 * nada: la página seguiría en pie con la sección apagada y el test pasaría.
 */

const SECCION = "reserva_la_fecha";
const RUTA = "/reserva-la-fecha";

/**
 * TODO EL FICHERO EN SERIE, y no solo el bloque que toca la base de datos.
 *
 * `fullyParallel` reparte los tests de un mismo fichero entre workers, así que
 * marcar en serie solo el bloque de abajo no impide que apague la sección
 * mientras otro worker está probando la página encendida. Pasó: los tests del
 * camino feliz empezaron a recibir 404. En CI no se habría visto —allí hay un
 * único worker— y habría sido un test que falla el día que alguien sube el
 * paralelismo.
 */
test.describe.configure({ mode: "serial" });

test.describe("Reserva la fecha", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA);
  });

  test("responde y muestra los nombres de la base de datos", async ({ page }) => {
    const titulo = page.getByRole("heading", { level: 1 });
    await expect(titulo).toBeVisible();
    // El prefijo (DES) solo existe en el seed: si se ve, viene de la base.
    await expect(titulo).toContainText("(DES)");
  });

  test("muestra la fecha y el lugar de la base de datos", async ({ page }) => {
    const fecha = page.locator("time");
    await expect(fecha).toBeVisible();
    // `datetime` en ISO: es lo que leen los lectores de pantalla y lo que
    // usará el `.ics` de BODA-31.
    await expect(fecha).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);

    await expect(page.getByText(/\(DES\).*[Ff]inca/).first()).toBeVisible();
  });

  test("cabe en una pantalla de móvil sin desplazarse", async ({ page }) => {
    const desbordamiento = await page.evaluate(() => ({
      alto: document.documentElement.scrollHeight,
      ventana: window.innerHeight,
      anchoDocumento: document.documentElement.scrollWidth,
      anchoVentana: window.innerWidth,
    }));

    // Un píxel de margen por el redondeo de los navegadores.
    expect(desbordamiento.alto).toBeLessThanOrEqual(desbordamiento.ventana + 1);
    // Y nunca scroll horizontal, ni en el móvil más estrecho.
    expect(desbordamiento.anchoDocumento).toBeLessThanOrEqual(desbordamiento.anchoVentana + 1);
  });

  test("desde aquí se llega a la web completa", async ({ page }) => {
    await page.getByRole("link", { name: copy.saveTheDate.verLaWeb }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#portada")).toBeVisible();
  });

  test("las meta tags llevan los datos reales, no un texto de plantilla", async ({ page }) => {
    await expect(page).toHaveTitle(/\(DES\)/);

    const descripcion = page.locator('meta[name="description"]');
    await expect(descripcion).toHaveAttribute("content", /\(DES\)/);
  });

  test("el botón de calendario apunta al fichero y se descarga", async ({ page }) => {
    const boton = page.getByRole("link", { name: copy.saveTheDate.anadirCalendario });

    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute("href", RUTA_CALENDARIO);
    // `download` para que el navegador lo guarde en vez de intentar pintarlo.
    await expect(boton).toHaveAttribute("download", "");
  });
});

/**
 * El fichero del calendario. Se pide por HTTP en lugar de hacer clic: lo que
 * importa es lo que llega, y una descarga no deja nada que mirar en pantalla.
 */
test.describe("Evento para el calendario", () => {
  test("se sirve como calendario y se descarga con nombre", async ({ request }) => {
    const respuesta = await request.get(RUTA_CALENDARIO);

    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["content-type"]).toContain("text/calendar");
    expect(respuesta.headers()["content-disposition"]).toContain(NOMBRE_FICHERO_CALENDARIO);
  });

  test("lleva la fecha y el lugar que hay en la base de datos", async ({ request, page }) => {
    const ics = await (await request.get(RUTA_CALENDARIO)).text();

    // La fecha del fichero tiene que ser la misma que pinta la página: si
    // alguien incrustara una fecha en el código, esto se cae.
    await page.goto(RUTA);
    const fechaEnPagina = await page.locator("time").getAttribute("datetime");
    const esperada = fechaEnPagina!.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

    expect(ics).toContain(`DTSTART:${esperada}`);
    expect(ics).toContain("(DES) Finca de pruebas");
    expect(ics).toMatch(/SUMMARY:.*\(DES\)/);
  });

  test("el evento no acaba cuando empieza el banquete", async ({ request }) => {
    const ics = await (await request.get(RUTA_CALENDARIO)).text();

    const inicio = ics.match(/DTSTART:(\S+)/)?.[1];
    const fin = ics.match(/DTEND:(\S+)/)?.[1];

    expect(inicio).toBeDefined();
    expect(fin).toBeDefined();
    expect(fin! > inicio!).toBe(true);
  });

  test("cumple el formato que exigen los calendarios", async ({ request }) => {
    const ics = await (await request.get(RUTA_CALENDARIO)).text();

    // CRLF: sin esto Outlook no abre el fichero.
    expect(/[^\r]\n/.test(ics)).toBe(false);

    // Y ninguna línea por encima de 75 octetos, contando en UTF-8.
    const codificador = new TextEncoder();
    for (const linea of ics.split("\r\n")) {
      expect(codificador.encode(linea).length).toBeLessThanOrEqual(75);
    }
  });
});

/**
 * Caso de error: apagar la sección tiene que retirar la página.
 *
 * Se toca la base de datos, así que va en serie y se restaura pase lo que
 * pase. La fila sólo la lee esta ruta —`reserva_la_fecha` no se pinta en la
 * landing, es una página aparte—, de modo que no puede interferir con el resto
 * de la suite.
 */
test.describe("Reserva la fecha apagada", () => {
  test.describe.configure({ mode: "serial" });

  const cadena = process.env.DATABASE_URL;

  test.skip(!cadena, "Hace falta DATABASE_URL para apagar la sección.");

  async function fijarVisible(visible: boolean) {
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      await sql`
        update public.secciones_landing
        set visible = ${visible}
        where seccion = ${SECCION}
      `;
    } finally {
      await sql.end();
    }
  }

  test.afterAll(async () => {
    if (cadena) await fijarVisible(true);
  });

  test("con la sección desactivada la ruta devuelve 404", async ({ page }) => {
    await fijarVisible(false);

    const respuesta = await page.goto(RUTA);
    expect(respuesta?.status()).toBe(404);

    // Y no se filtra ni un dato por el camino.
    await expect(page.locator("body")).not.toContainText("(DES)");
  });

  test("con la sección desactivada el calendario tampoco se descarga", async ({ request }) => {
    await fijarVisible(false);

    // Si no, quedaría una puerta trasera para sacar la fecha de una página que
    // se ha querido retirar.
    const respuesta = await request.get(RUTA_CALENDARIO);
    expect(respuesta.status()).toBe(404);
  });

  test("volver a encenderla la devuelve", async ({ page }) => {
    await fijarVisible(true);

    const respuesta = await page.goto(RUTA);
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES)");
  });
});
