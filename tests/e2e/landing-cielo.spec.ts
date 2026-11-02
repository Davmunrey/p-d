import postgres from "postgres";

import { expect, test, type Locator, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";

/**
 * LA LANDING ES UN SOLO CIELO, DE LA NOCHE AL DÍA
 *
 * No hay secciones con fondo propio: hay un cielo que empieza de noche, bajo
 * un firmamento entero que GIRA al bajar —la portada y el final de la noche
 * no tienen el mismo cielo encima—, amanece en una franja sin texto y llega de
 * día al mapa del sitio de la boda, donde se posa una estrella. Debajo, los
 * regalos y, lo último, vuestra estrella: la confirmación.
 *
 * Se prueba leyendo lo que el código publica —`data-giro`, `data-cielo`,
 * `data-llegada`— y lo que el navegador tiene pintado de verdad: los píxeles
 * del lienzo. Cada gesto con su caso de error: sin movimiento el cielo no gira
 * y la estrella ya está posada; sin JavaScript, la noche es noche igual; sin
 * coordenadas, no hay mapa y la página acaba de día igualmente.
 */

const MOVIL = { width: 390, height: 844 };

async function conMovimientoReducido(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const activo = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  test.skip(!activo, "Este navegador no aplica la emulación de prefers-reduced-motion");
}

/** Pone un elemento a una altura de la pantalla (0 arriba, 1 abajo). */
async function ponerA(page: Page, elemento: Locator, altura: number): Promise<void> {
  await elemento.evaluate(
    (nodo, a) =>
      window.scrollTo({
        top: nodo.getBoundingClientRect().top + window.scrollY - window.innerHeight * a,
        behavior: "instant",
      }),
    altura,
  );
}

const lienzo = (page: Page) => page.locator('[data-tramo="noche"] [data-cielo-estrellado]');

const giro = async (page: Page) => Number(await lienzo(page).getAttribute("data-giro"));

test.describe("Un solo cielo, de la noche al día", () => {
  test("la noche, el amanecer y el día van en orden, y ninguna sección tiene fondo", async ({
    page,
  }) => {
    await page.goto("/");

    const orden = await page.evaluate(() => {
      const noche = document.querySelector('[data-tramo="noche"]')!;
      const amanecer = document.querySelector("[data-amanecer]")!;
      const dia = document.querySelector('[data-tramo="dia"]')!;
      const despues = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        enOrden: despues(noche, amanecer) && despues(amanecer, dia),
        nocheInversa: noche.getAttribute("data-seccion"),
        amanecerCallado: amanecer.getAttribute("aria-hidden"),
        amanecerSinTexto: amanecer.textContent?.trim() ?? "",
        conFondo: [...document.querySelectorAll<HTMLElement>("main section")]
          .filter((seccion) => {
            const estilo = getComputedStyle(seccion);
            return (
              estilo.backgroundImage !== "none" || estilo.backgroundColor !== "rgba(0, 0, 0, 0)"
            );
          })
          .map((seccion) => seccion.id),
      };
    });

    expect(orden.enOrden).toBe(true);
    expect(orden.nocheInversa, "la noche lleva los colores de noche de la marca").toBe(
      "inversa",
    );
    expect(orden.amanecerCallado).toBe("true");
    expect(orden.amanecerSinTexto, "en el amanecer no hay nada que leer").toBe("");
    expect(orden.conFondo, "el cielo es uno: ninguna sección pinta el suyo").toEqual([]);
  });

  test("la historia es de noche; el día llega al mapa y acaba en vuestra estrella", async ({
    page,
  }) => {
    await page.goto("/");

    const deNoche = page.locator('[data-tramo="noche"]');
    await expect(deNoche.locator("#portada")).toHaveCount(1);
    await expect(deNoche.locator("#historia")).toHaveCount(1);
    await expect(deNoche.locator("#rsvp")).toHaveCount(0);

    /*
      La llegada, en este orden: dónde dormir, cómo llegar —el mapa, donde se
      posa la estrella—, los regalos y, lo último de todo, vuestra estrella:
      la confirmación va al final, después de haberlo leído todo.
    */
    const ultima = await page.evaluate(
      () => [...document.querySelectorAll("main section[id]")].at(-1)?.id,
    );
    expect(ultima).toBe("rsvp");
    await expect(
      page.locator('[data-tramo="dia"] #alojamiento + #transporte + #regalos + #rsvp'),
    ).toHaveCount(1);
  });

  test("la landing cabe en pocas pantallas en un móvil", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/");
    const pantallas = await page.evaluate(
      () => document.documentElement.scrollHeight / window.innerHeight,
    );
    /*
      Eran casi veinte. Con los datos de prueba —que traen el programa y la
      víspera por duplicado— la página mide unas doce; con los de verdad, unas
      diez. El tope deja margen para el contenido, no para volver a meter
      escenas de tres pantallas.
    */
    expect(pantallas).toBeLessThan(13);
  });
});

test.describe("El firmamento gira con la noche", () => {
  test("un cielo entero que se enciende, decorativo para quien no ve", async ({ page }) => {
    await page.goto("/");
    const cielo = lienzo(page);
    await expect(cielo).toHaveCount(1);
    await expect(cielo).toHaveAttribute("aria-hidden", "true");
    await expect(cielo).toHaveAttribute("data-cielo", "vivo");
    expect(Number(await cielo.getAttribute("data-estrellas"))).toBeGreaterThan(100);
  });

  test("al bajar, el cielo gira: no es siempre la misma constelación", async ({ page }) => {
    await page.goto("/");
    await expect(lienzo(page)).toHaveAttribute("data-giro", "0.00");

    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight, behavior: "instant" }),
    );
    await expect.poll(() => giro(page)).toBeGreaterThan(5);
    const unaPantalla = await giro(page);

    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight * 2, behavior: "instant" }),
    );
    await expect.poll(() => giro(page)).toBeGreaterThan(unaPantalla + 5);
  });

  test("y se apaga al amanecer: por debajo del horizonte no queda ninguna estrella", async ({
    page,
  }) => {
    await page.goto("/");
    // El horizonte, a media pantalla.
    await ponerA(page, page.locator("[data-amanecer]"), 0.5);

    /*
      LAS DOS COSAS A LA VEZ, Y ESPERANDO A QUE SE PINTE. Al cargar, las
      estrellas se encienden desde cero (`DURACION_ENCENDIDO_MS`): en el primer
      fotograma el lienzo está vacío, y «debajo no hay nada» se cumplía por eso
      mismo. Se leía el «arriba sí» una sola vez, justo después, y en Safari
      caía alguna vez en ese lienzo todavía vacío. Ahora se espera a que haya
      cielo arriba Y ninguna estrella abajo en la misma lectura.
    */
    await expect
      .poll(() =>
        lienzo(page).evaluate((nodo) => {
          const canvas = nodo as HTMLCanvasElement;
          const contexto = canvas.getContext("2d")!;
          const caja = canvas.getBoundingClientRect();
          const horizonte = document
            .querySelector("[data-amanecer]")!
            .getBoundingClientRect().top;
          const escala = canvas.height / caja.height;
          const corte = Math.max(0, Math.floor((horizonte - caja.top) * escala));

          let abajo = 0;
          if (corte < canvas.height) {
            const { data } = contexto.getImageData(
              0,
              corte,
              canvas.width,
              canvas.height - corte,
            );
            for (let i = 3; i < data.length; i += 4) if (data[i] > 0) abajo += 1;
          }

          let arriba = false;
          const { data } = contexto.getImageData(
            0,
            0,
            canvas.width,
            Math.floor(canvas.height / 4),
          );
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) {
              arriba = true;
              break;
            }
          }
          return { abajo, arriba };
        }),
      )
      .toEqual({ abajo: 0, arriba: true });
  });

  test("lo que no se ve no se pinta: de día, el cielo de la noche espera parado", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#transporte").scrollIntoViewIfNeeded();
    await expect(lienzo(page)).toHaveAttribute("data-cielo", "pausado");
  });

  test("con movimiento reducido el cielo se pinta quieto y no gira", async ({ page }) => {
    await conMovimientoReducido(page);
    await expect(lienzo(page)).toHaveAttribute("data-cielo", "quieto");
    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight, behavior: "instant" }),
    );
    await page.waitForTimeout(300);
    await expect(lienzo(page)).toHaveAttribute("data-giro", "0.00");
  });
});

test.describe("Sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("la noche es noche y el día es día, con todo a la vista", async ({ page }) => {
    await page.goto("/");
    const fondos = await page.evaluate(() =>
      ['[data-tramo="noche"]', "[data-amanecer]", '[data-tramo="dia"]'].map(
        (selector) => getComputedStyle(document.querySelector(selector)!).backgroundImage,
      ),
    );
    for (const fondo of fondos) expect(fondo).toContain("gradient");

    await expect(page.getByRole("heading", { name: copy.historia.titulo })).toBeVisible();
    await expect(page.getByRole("heading", { name: copy.rsvp.titulo })).toBeVisible();
    // La estrella del final sale posada del servidor: el sitio se ve siempre.
    await expect(page.locator("[data-estrella-llegada]")).toHaveAttribute(
      "data-llegada",
      "posada",
    );
  });
});

test.describe("Nuestra historia, una estrella por momento", () => {
  test("cada hito lleva su estrella, y la historia se sigue leyendo como una lista", async ({
    page,
  }) => {
    await page.goto("/");
    const hitos = page.locator("#historia ol > li");
    const cuantos = await hitos.count();
    expect(cuantos).toBeGreaterThan(0);

    // Una estrella por hito, decorativa; el texto es lo que se lee.
    await expect(page.locator('#historia ol > li svg[aria-hidden="true"]')).toHaveCount(
      cuantos,
    );
    for (let i = 0; i < cuantos; i += 1) {
      await expect(hitos.nth(i).locator("h3")).not.toBeEmpty();
    }
    await expect(page.locator("#historia")).toContainText(copy.historia.cierre);
  });
});

test.describe("La página acaba con vuestra estrella", () => {
  test("la vuestra late hueca, y es el desplegable de la confirmación", async ({ page }) => {
    await page.goto("/");
    const rsvp = page.locator('[data-tramo="dia"] #rsvp');
    const estrella = rsvp.locator('summary [data-vuestra-estrella="falta"]');
    await expect(estrella).toHaveAttribute("aria-hidden", "true");
    await expect(rsvp.locator("summary")).toContainText(copy.rsvp.faltaVuestraEstrella);
    await expect(rsvp.getByRole("heading", { name: copy.rsvp.titulo })).toBeVisible();
    // Plegada: lo de dentro no se ve hasta tocarla.
    await expect(rsvp.locator("details")).not.toHaveAttribute("open", /.*/);
  });
});

test.describe("El día acaba en el lugar", () => {
  test("la estrella espera arriba y baja al sitio cuando llega el mapa", async ({ page }) => {
    await page.goto("/");
    const estrella = page.locator("[data-estrella-llegada]");
    await expect(estrella).toHaveAttribute("data-llegada", "arriba");

    // El sitio, a media pantalla: por encima de la línea que la hace bajar.
    await ponerA(page, estrella, 0.5);
    await expect(estrella).toHaveAttribute("data-llegada", "bajando");

    // Baja de verdad: acaba en su sitio, sin desplazamiento, y a la vista.
    const marca = estrella.locator(".estrella-que-baja");
    await expect
      .poll(() => marca.evaluate((nodo) => getComputedStyle(nodo).transform), {
        timeout: 6000,
      })
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect.poll(() => marca.evaluate((nodo) => getComputedStyle(nodo).opacity)).toBe("1");
  });

  test("con movimiento reducido la estrella ya está posada", async ({ page }) => {
    await conMovimientoReducido(page);
    await expect(page.locator("[data-estrella-llegada]")).toHaveAttribute(
      "data-llegada",
      "posada",
    );
  });

  /*
    CASO DE ERROR. Si una tesela no llega —sin conexión, un bloqueador—, no
    puede quedar el icono de imagen rota en medio del plano: se esconde y queda
    el cielo de día. Aquí se cortan todas las peticiones de teselas.
  */
  test("una tesela que no carga se esconde y no deja un icono roto", async ({ page }) => {
    await page.route(/tile\.openstreetmap\.org/, (ruta) => ruta.abort());
    await page.goto("/");
    await page.locator("#transporte").scrollIntoViewIfNeeded();

    const teselas = page.locator("[data-mapa-del-lugar] img");
    await expect
      .poll(() =>
        teselas.evaluateAll(
          (imagenes) =>
            imagenes.filter(
              (imagen) =>
                (imagen as HTMLImageElement).complete &&
                getComputedStyle(imagen).visibility !== "hidden",
            ).length,
        ),
      )
      .toBe(0);
    // El sitio sigue marcado: la estrella no depende del mapa.
    await expect(page.locator("[data-estrella-llegada] .estrella-que-baja")).toBeVisible();
  });
});

/*
  CASO DE ERROR. Sin coordenadas no hay a dónde llegar: ni mapa ni estrella,
  y la página acaba de día igualmente, sin un hueco donde iba el mapa.
*/
test.describe("Sin coordenadas", () => {
  const cadena = process.env.DATABASE_URL;
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing lee de la base real.");
  test.describe.configure({ mode: "serial" });

  async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      return await trabajo(sql);
    } finally {
      await sql.end();
    }
  }

  test("no hay mapa ni estrella, y el día sigue siendo el final", async ({ page }) => {
    const [original] = await conBase(
      (sql) => sql<{ latitud: string | null; longitud: string | null }[]>`
        select latitud_ceremonia as latitud, longitud_ceremonia as longitud
          from public.configuracion_boda limit 1
      `,
    );
    try {
      await conBase(
        (sql) => sql`
          update public.configuracion_boda
             set latitud_ceremonia = null, longitud_ceremonia = null
        `,
      );
      await page.goto("/");
      await expect(page.locator("[data-mapa-del-lugar]")).toHaveCount(0);
      await expect(page.locator("[data-estrella-llegada]")).toHaveCount(0);
      await expect(page.locator('[data-tramo="dia"]')).toHaveCount(1);
    } finally {
      await conBase(
        (sql) => sql`
          update public.configuracion_boda
             set latitud_ceremonia = ${original.latitud},
                 longitud_ceremonia = ${original.longitud}
        `,
      );
    }
  });
});
