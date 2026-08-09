import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

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

  test("no se ofrece nada que todavía no exista", async ({ page }) => {
    // El `.ics` es BODA-31. Hasta entonces no puede haber un botón que no haga
    // nada: la regla 3 prohíbe entregar botones sin acción.
    await expect(
      page.getByRole("link", { name: copy.saveTheDate.anadirCalendario }),
    ).toHaveCount(0);
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

  test("volver a encenderla la devuelve", async ({ page }) => {
    await fijarVisible(true);

    const respuesta = await page.goto(RUTA);
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES)");
  });
});
