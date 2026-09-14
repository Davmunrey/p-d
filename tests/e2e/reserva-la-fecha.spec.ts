import { expect, test, type Page } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { fijarSeccionVisible } from "./utiles/secciones";
import {
  NOMBRE_FICHERO_CALENDARIO,
  PARAMETRO_SOBRE_ABIERTO,
  RUTA_CALENDARIO,
} from "../../src/config/constants";

/**
 * BODA-30 · Reserva la fecha
 * BODA-121 · El sobre de la entrega
 *
 * Lo primero que se manda a los invitados: un sobre cerrado con un sello que,
 * al tocarlo, suelta la foto y la tarjeta con quién, cuándo y dónde. Se
 * comprueba lo de siempre —que los datos salen de la base y no de un literal—
 * y lo que la pieza promete: que se abre con el dedo, con el teclado y sin
 * JavaScript; que se puede volver a cerrar; que cabe en un móvil; y que la
 * página **deja de existir** si se apaga su fila de `secciones_landing`.
 *
 * Ese último caso se prueba de verdad, apagando el interruptor contra la
 * base real y comprobando el 404. Un test que solo mirara el copy no probaría
 * nada: la página seguiría en pie con la sección apagada y el test pasaría.
 */

const SECCION = "reserva_la_fecha";
const RUTA = "/reserva-la-fecha";

/** Un móvil de hoy: donde se abre esta página casi siempre. */
const MOVIL = { width: 390, height: 844 };

const pieza = (page: Page) => page.locator(".pieza-sobre");
const sello = (page: Page) => page.getByRole("button", { name: copy.saveTheDate.abrir });
const tarjeta = (page: Page) => page.locator(".naipe-tarjeta");

/**
 * Toca el sello con el componente ya despierto y espera a la última fase.
 *
 * Se espera a `data-hidratado` a propósito: antes de hidratar, el sello manda
 * el formulario y la página se recarga abierta — que es correcto, pero no es
 * lo que se está probando aquí. Eso tiene su propio bloque más abajo.
 */
async function abrirElSobre(page: Page) {
  await expect(pieza(page)).toHaveAttribute("data-hidratado", "");
  await sello(page).click();
  await expect(pieza(page)).toHaveAttribute("data-fuera", "");
}

/** Cuánto ocupa el documento frente a la ventana, para saber si hay scroll. */
function medir(page: Page) {
  return page.evaluate(() => ({
    alto: document.documentElement.scrollHeight,
    ventana: window.innerHeight,
    anchoDocumento: document.documentElement.scrollWidth,
    anchoVentana: window.innerWidth,
  }));
}

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

  test("llega cerrado: el sello es un botón y la tarjeta espera dentro", async ({ page }) => {
    // `exact`: la nota del pie también dice «guardad el día», en minúscula.
    await expect(page.getByText(copy.saveTheDate.cabecera, { exact: true })).toBeVisible();
    await expect(sello(page)).toBeVisible();
    await expect(sello(page)).toBeEnabled();
    await expect(page.getByText(copy.saveTheDate.pista)).toBeVisible();

    // Lo que no se ve no se alcanza: ni la tarjeta ni los botones del pie.
    await expect(tarjeta(page)).toHaveAttribute("inert", "");
    await expect(page.locator(".pie-sobre")).toHaveAttribute("inert", "");
    await expect(tarjeta(page)).toHaveCSS("opacity", "0");
    await expect(pieza(page)).not.toHaveAttribute("data-abierto", /.*/);
  });

  test("al tocar el sello se abre y se lee la tarjeta con los datos de la base", async ({
    page,
  }) => {
    await abrirElSobre(page);

    // El prefijo (DES) solo existe en el seed: si se ve, viene de la base.
    const titulo = page.getByRole("heading", { level: 1 });
    await expect(titulo).toBeVisible();
    await expect(titulo).toContainText("(DES)");

    // La fecha en dos líneas: «Sábado 26 de junio» y el año debajo.
    const fecha = page.locator("time");
    await expect(fecha).toBeVisible();
    await expect(fecha).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
    await expect(fecha).toHaveText(/^[A-ZÁÉÍÓÚ][a-záéíóúñ]+ \d{1,2} de [a-záéíóú]+$/);
    await expect(tarjeta(page).getByText(/^\d{4}$/)).toBeVisible();

    await expect(page.getByText(/\(DES\).*[Ff]inca/).first()).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();

    // El pie: la nota, los dos botones y la forma de cerrarlo.
    await expect(page.getByText(copy.saveTheDate.nota)).toBeVisible();
    await expect(
      page.getByRole("link", { name: copy.saveTheDate.anadirCalendario }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: copy.saveTheDate.verLaWeb })).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.saveTheDate.volverAlSobre }),
    ).toBeVisible();

    // El sobre se ha ido y no se puede volver a tocar; el foco está en la tarjeta.
    await expect(page.locator(".sobre")).toHaveAttribute("inert", "");
    await expect(tarjeta(page)).toBeFocused();
  });

  test("la cuenta atrás de la tarjeta va en vivo", async ({ page }) => {
    await abrirElSobre(page);

    const contador = page.getByRole("timer");
    const antes = await contador.innerText();
    await expect.poll(() => contador.innerText(), { timeout: 3000 }).not.toBe(antes);
  });

  test("se abre con el teclado, el foco sigue a la pieza y se vuelve a cerrar", async ({
    page,
  }) => {
    await expect(pieza(page)).toHaveAttribute("data-hidratado", "");
    await sello(page).focus();
    await page.keyboard.press("Enter");
    await expect(pieza(page)).toHaveAttribute("data-fuera", "");
    await expect(tarjeta(page)).toBeFocused();

    await page.getByRole("button", { name: copy.saveTheDate.volverAlSobre }).click();

    await expect(pieza(page)).not.toHaveAttribute("data-abierto", /.*/);
    await expect(sello(page)).toBeFocused();
    await expect(tarjeta(page)).toHaveAttribute("inert", "");
    await expect(page.locator(".pie-sobre")).toHaveAttribute("inert", "");
  });

  test("cabe en la pantalla sin desplazarse, cerrado en cualquier ventana", async ({
    page,
  }) => {
    const cerrado = await medir(page);

    // Un píxel de margen por el redondeo de los navegadores.
    expect(cerrado.alto).toBeLessThanOrEqual(cerrado.ventana + 1);
    // Y nunca scroll horizontal, ni en el móvil más estrecho.
    expect(cerrado.anchoDocumento).toBeLessThanOrEqual(cerrado.anchoVentana + 1);
  });

  /**
   * Abierto, la página crece por abajo con el pie —la entrega también—, así
   * que lo que se promete es otra cosa: que la tarjeta se lee entera sin tocar
   * nada, que el pie empieza a la vista, y que nunca hay scroll horizontal.
   */
  test("y abierto, la tarjeta se lee entera en un móvil de hoy", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto(RUTA);
    await abrirElSobre(page);
    await expect(
      page.getByRole("button", { name: copy.saveTheDate.volverAlSobre }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const naipe = await tarjeta(page).boundingBox();
        const nota = await page.getByText(copy.saveTheDate.nota).boundingBox();
        const ventana = page.viewportSize()!;
        return {
          tarjetaEntera: !!naipe && naipe.y >= 0 && naipe.y + naipe.height <= ventana.height,
          notaALaVista: !!nota && nota.y < ventana.height,
        };
      })
      .toEqual({ tarjetaEntera: true, notaALaVista: true });

    const abierto = await medir(page);
    expect(abierto.anchoDocumento).toBeLessThanOrEqual(abierto.anchoVentana + 1);
  });

  test("desde aquí se llega a la web completa", async ({ page }) => {
    await abrirElSobre(page);
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
    await abrirElSobre(page);
    const boton = page.getByRole("link", { name: copy.saveTheDate.anadirCalendario });

    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute("href", RUTA_CALENDARIO);
    // `download` para que el navegador lo guarde en vez de intentar pintarlo.
    await expect(boton).toHaveAttribute("download", "");
  });
});

/**
 * CASO DE ERROR · Sin JavaScript el sobre se abre igual.
 *
 * El sello es el botón de un formulario GET: sin script —o antes de que
 * llegue, en la conexión del pueblo— la pulsación recarga la página con
 * `?abierto` y el servidor la pinta ya abierta. Nunca un botón que no hace
 * nada.
 */
test.describe("Reserva la fecha sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("el sello abre la invitación recargando la página", async ({ page }) => {
    await page.goto(RUTA);
    await expect(sello(page)).toBeVisible();
    await expect(tarjeta(page)).toHaveAttribute("inert", "");

    await sello(page).click();

    await expect(page).toHaveURL(new RegExp(`\\?${PARAMETRO_SOBRE_ABIERTO}=1`));
    await expect(pieza(page)).toHaveAttribute("data-fuera", "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES)");
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(
      page.getByRole("link", { name: copy.saveTheDate.anadirCalendario }),
    ).toBeVisible();

    // Y volver a cerrarlo es cargar la página sin el parámetro.
    await page.getByRole("button", { name: copy.saveTheDate.volverAlSobre }).click();
    await expect(page).not.toHaveURL(new RegExp(PARAMETRO_SOBRE_ABIERTO));
    await expect(sello(page)).toBeVisible();
    await expect(tarjeta(page)).toHaveAttribute("inert", "");
  });
});

/**
 * CASO DE ERROR · Con movimiento reducido no hay coreografía.
 *
 * Ni bucles —el sello no late, la pista no flota, el cielo no deriva— ni dos
 * segundos de espera: al tocar el sello se salta a la última fase.
 */
test.describe("Reserva la fecha con movimiento reducido", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("nada se mueve en bucle y el sobre se abre de golpe", async ({ page }) => {
    await page.goto(RUTA);

    const enBucle = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animacion) => animacion.effect?.getTiming().iterations === Infinity).length,
    );
    expect(enBucle).toBe(0);

    await expect(pieza(page)).toHaveAttribute("data-hidratado", "");
    await sello(page).click();
    // Muy por debajo de los 1900 ms de la apertura animada.
    await expect(pieza(page)).toHaveAttribute("data-fuera", "", { timeout: 1000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
    // «Boda de Ana y Luis» y «Nos casamos. Guardad el día.», como la entrega.
    expect(ics).toMatch(/SUMMARY:Boda de .*\(DES\)/);
    expect(ics).toContain("DESCRIPTION:Nos casamos. Guardad el día.");
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

  test.afterAll(async () => {
    if (cadena) await fijarSeccionVisible(SECCION, true);
  });

  test("con la sección desactivada la ruta devuelve 404", async ({ page }) => {
    await fijarSeccionVisible(SECCION, false);

    const respuesta = await page.goto(RUTA);
    expect(respuesta?.status()).toBe(404);

    // Y no se filtra ni un dato por el camino.
    await expect(page.locator("body")).not.toContainText("(DES)");
  });

  test("con la sección desactivada el calendario tampoco se descarga", async ({ request }) => {
    await fijarSeccionVisible(SECCION, false);

    // Si no, quedaría una puerta trasera para sacar la fecha de una página que
    // se ha querido retirar.
    const respuesta = await request.get(RUTA_CALENDARIO);
    expect(respuesta.status()).toBe(404);
  });

  test("volver a encenderla la devuelve", async ({ page }) => {
    await fijarSeccionVisible(SECCION, true);

    const respuesta = await page.goto(RUTA);
    expect(respuesta?.status()).toBe(200);
    await expect(sello(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES)");
  });
});

/**
 * BODA-32 · Lo que se ve al compartir el enlace
 *
 * El enlace se va a pegar en WhatsApp cientos de veces. Se comprueba que la
 * tarjeta lleva los datos de verdad y que la imagen se genera; lo que NO se
 * comprueba aquí es cómo la pinta WhatsApp, que eso no es cosa de esta web.
 */
test.describe("Vista previa al compartir", () => {
  test("las meta tags de Open Graph llevan los datos de la base", async ({ page }) => {
    await page.goto(RUTA);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /\(DES\)/,
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      "content",
      /\(DES\)/,
    );
  });

  test("la imagen es absoluta: una ruta relativa no la resuelve WhatsApp", async ({ page }) => {
    await page.goto(RUTA);

    const imagen = page.locator('meta[property="og:image"]');
    await expect(imagen).toHaveAttribute("content", /^https?:\/\//);
  });

  test("la imagen se genera de verdad y es un PNG", async ({ page, request }) => {
    await page.goto(RUTA);
    const url = await page.locator('meta[property="og:image"]').getAttribute("content");

    const respuesta = await request.get(new URL(url!).pathname);
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["content-type"]).toContain("image/png");

    // Firma PNG: si saliera un texto de error, esto lo caza.
    const bytes = await respuesta.body();
    expect([...bytes.subarray(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
    // Y que no sea un lienzo vacío de cuatro bytes.
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  test("la landing también tiene su tarjeta", async ({ page, request }) => {
    await page.goto("/");

    const url = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(url).toMatch(/^https?:\/\//);

    const respuesta = await request.get(new URL(url!).pathname);
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["content-type"]).toContain("image/png");
  });
});
