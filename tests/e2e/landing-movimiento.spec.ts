import postgres from "postgres";

import { expect, test, type Locator, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";

/**
 * LA LANDING SE MUEVE CON INTENCIÓN
 *
 * La evolución editorial de la landing añadió cinco gestos, y cada uno tiene
 * aquí su prueba y su caso de error:
 *
 * 1. Sin foto de portada, la otra mitad dibuja la Lira de los novios: el
 *    anillo se cierra, las estrellas se encienden y los trazos las unen. En un
 *    móvil no se pinta, y con la foto publicada no se monta.
 * 2. La «y» de la portada se escribe.
 * 3. La cifra de la cuenta atrás que cambia rueda; la que no cambia, quieta.
 * 4. Un hilo de bronce recorre el programa al bajar, y cada hora se enciende.
 * 5. Los botones ceden al pulsarlos.
 *
 * Y lo que no se negocia: con movimiento reducido todo está ya dibujado,
 * escrito y en su color, sin esperar a nada.
 *
 * Se mira el CSS calculado y las animaciones del documento, no capturas: lo
 * que se comprueba es el contrato —qué se anima, en qué orden y cómo acaba—,
 * no el píxel.
 */

const cadena = process.env.DATABASE_URL;

/**
 * EN SERIE: el primer bloque despublica la foto de portada, que es una fila
 * compartida por toda la landing. Mientras tanto, otro test que la espere no
 * puede estar corriendo.
 */
test.describe.configure({ mode: "serial" });

const ESCRITORIO = { width: 1440, height: 900 };
const MOVIL = { width: 390, height: 844 };

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** Despublica las fotos de portada y devuelve cuáles eran, para volver a ponerlas. */
async function quitarFotoDePortada(): Promise<string[]> {
  const filas = await conBase(
    (sql) => sql<{ id: string }[]>`
      update public.medios
         set publicado = false
       where seccion = 'portada' and publicado
   returning id
    `,
  );
  return filas.map((fila) => fila.id);
}

async function devolverFotoDePortada(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await conBase(
    (sql) => sql`
      update public.medios set publicado = true where id in ${sql(ids)}
    `,
  );
}

/**
 * Espera a que acaben las animaciones de entrada de un elemento y sus hijos.
 * Las que no acaban nunca —el titileo, la deriva del cielo— y las que van con
 * el scroll se quedan fuera: esas no tienen un «después».
 *
 * UNA ANIMACIÓN CANCELADA TAMBIÉN HA ACABADO. WebKit cancela y vuelve a crear
 * la de entrada cuando el estilo se recalcula —con movimiento reducido, al
 * aplicar la regla que la acorta—, y su `finished` se rechaza con
 * `AbortError` en vez de resolverse. Lo que se espera es que no quede nada
 * moviéndose, y eso se cumple igual.
 */
async function entradaTerminada(elemento: Locator): Promise<void> {
  await elemento.first().evaluate(async (nodo) => {
    const deEntrada = nodo
      .getAnimations({ subtree: true })
      .filter(
        (animacion) =>
          animacion.timeline === document.timeline &&
          Number.isFinite(animacion.effect?.getComputedTiming().iterations ?? Infinity),
      );
    await Promise.all(deEntrada.map((animacion) => animacion.finished.catch(() => undefined)));
  });
}

async function conMovimientoReducido(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const activo = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  test.skip(!activo, "Este navegador no aplica la emulación de prefers-reduced-motion");
}

const DIBUJO = "#portada [data-constelacion-portada]";

test.describe("La portada sin foto dibuja la constelación", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la portada lee sus fotos de la base real.");

  let fotos: string[] = [];

  test.beforeAll(async () => {
    fotos = await quitarFotoDePortada();
  });

  test.afterAll(async () => {
    await devolverFotoDePortada(fotos);
  });

  /**
   * CAMINO FELIZ · la Lira ocupa la mitad de la foto y se dibuja en orden:
   * cada trazo y cada estrella empieza después del anterior, y al acabar el
   * anillo y los trazos están enteros.
   */
  test("en escritorio, la Lira se dibuja en la otra mitad de la portada", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const dibujo = page.locator(DIBUJO);
    await expect(dibujo).toBeVisible();
    await expect(dibujo).toHaveAttribute("aria-hidden", "true");

    // A la derecha de los nombres, en la misma fila: es la segunda columna.
    const nombres = await page.locator("#portada h1").boundingBox();
    const caja = await dibujo.boundingBox();
    expect(caja!.x, "la constelación va a la derecha del texto").toBeGreaterThan(
      nombres!.x + nombres!.width,
    );

    const animaciones = await dibujo.evaluate((nodo) => {
      const estilo = (el: Element) => getComputedStyle(el);
      const trazos = [...nodo.querySelectorAll(".constelacion-dibujada line")];
      const estrellas = [...nodo.querySelectorAll(".constelacion-dibujada circle")];
      return {
        anillo: estilo(nodo.querySelector(".anillo-dibujado")!).animationName,
        trazos: trazos.map((t) => ({
          nombre: estilo(t).animationName,
          retardo: parseFloat(estilo(t).animationDelay),
          longitud: t.getAttribute("pathLength"),
        })),
        estrellas: estrellas.map((e) => ({
          nombre: estilo(e).animationName,
          retardo: parseFloat(estilo(e).animationDelay),
        })),
      };
    });

    expect(animaciones.anillo).toBe("dibujar-trazo");
    expect(animaciones.trazos.length).toBeGreaterThan(1);
    expect(animaciones.estrellas.length).toBeGreaterThan(1);
    for (const trazo of animaciones.trazos) {
      expect(trazo.nombre).toBe("dibujar-trazo");
      expect(trazo.longitud, "sin pathLength el guion no mide el trazo").toBe("1");
    }
    for (const estrella of animaciones.estrellas) {
      expect(estrella.nombre).toBe("pop, titilar");
    }

    // En orden: cada pieza empieza después que la anterior, y las estrellas
    // se encienden antes de que el primer trazo las una.
    const retardosTrazos = animaciones.trazos.map((t) => t.retardo);
    const retardosEstrellas = animaciones.estrellas.map((e) => e.retardo);
    expect(retardosTrazos).toEqual([...retardosTrazos].sort((a, b) => a - b));
    expect(retardosEstrellas).toEqual([...retardosEstrellas].sort((a, b) => a - b));
    expect(retardosTrazos[0]).toBeGreaterThan(retardosEstrellas[0]);

    // Y acaba entero: ni el anillo ni un trazo se quedan a medias.
    await entradaTerminada(page.locator(DIBUJO));
    const desplazamientos = await dibujo.evaluate((nodo) =>
      [...nodo.querySelectorAll(".anillo-dibujado, .constelacion-dibujada line")].map((el) =>
        parseFloat(getComputedStyle(el).strokeDashoffset),
      ),
    );
    expect(new Set(desplazamientos)).toEqual(new Set([0]));
  });

  /**
   * CASO DE ERROR · en un móvil la portada apilada ya llena la pantalla, y la
   * constelación debajo empujaría el botón de confirmar fuera de ella.
   */
  test("en un móvil no se pinta, y el texto se queda solo", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/");

    await expect(page.locator("#portada h1")).toBeVisible();
    await expect(page.locator(DIBUJO)).toBeHidden();
  });

  /** CASO DE ERROR · con movimiento reducido llega ya dibujada, sin esperar. */
  test("con movimiento reducido aparece ya dibujada", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await conMovimientoReducido(page);

    await entradaTerminada(page.locator(DIBUJO));
    const estado = await page.locator(DIBUJO).evaluate((nodo) => ({
      nombres: [...nodo.querySelectorAll(".anillo-dibujado, .constelacion-dibujada *")].map(
        (el) => getComputedStyle(el).animationName,
      ),
      desplazamientos: [...nodo.querySelectorAll(".anillo-dibujado, line")].map((el) =>
        parseFloat(getComputedStyle(el).strokeDashoffset),
      ),
      cielo: getComputedStyle(nodo.querySelector(".animacion-cielo-claro")!).animationName,
    }));

    expect(new Set(estado.nombres)).toEqual(new Set(["aparecer"]));
    expect(new Set(estado.desplazamientos)).toEqual(new Set([0]));
    expect(estado.cielo).toBe("none");
  });
});

test.describe("El movimiento de la landing", () => {
  /** CASO DE ERROR · con la foto publicada, la foto ocupa su sitio y esto no se monta. */
  test("con foto de portada no hay constelación", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const conFoto = await page.locator("#portada img").count();
    test.skip(conFoto === 0, "La base no tiene foto de portada publicada");
    await expect(page.locator(DIBUJO)).toHaveCount(0);
  });

  test("la «y» de la portada se escribe, y sólo la de la portada", async ({ page }) => {
    await page.goto("/");

    const conector = page
      .locator("#portada")
      .getByText(copy.portada.conjuncion, { exact: true });
    await expect(conector).toHaveCSS("animation-name", "escribir");

    // Al acabar está entera: el recorte final deja holgura por los cuatro lados.
    await entradaTerminada(conector);
    await expect(conector).toHaveCSS("clip-path", /-50%/);

    // Las demás «y» de la página —la de la escena— no se escriben.
    const otras = await page.evaluate(
      () => document.querySelectorAll(".font-conector.animacion-escribir").length,
    );
    expect(otras).toBe(1);
  });

  test("con movimiento reducido la «y» ya está escrita", async ({ page }) => {
    await conMovimientoReducido(page);

    const conector = page
      .locator("#portada")
      .getByText(copy.portada.conjuncion, { exact: true });
    await expect(conector).toHaveCSS("animation-name", "aparecer");
    await expect(conector).toHaveCSS("clip-path", "none");
  });

  /**
   * CAMINO FELIZ Y SU CONTRARIO EN UNO: la cifra que cambia es un nodo nuevo
   * que rueda; la que no cambia sigue siendo el mismo nodo, quieto.
   */
  test("la cifra de la cuenta atrás que cambia rueda, y la que no, no", async ({ page }) => {
    await page.goto("/");

    const bloques = page.getByRole("timer").locator("> div");
    const segundos = await bloques.nth(3).locator("div").first().elementHandle();
    const dias = await bloques.nth(0).locator("div").first().elementHandle();

    // El nodo de los segundos se sustituye en cuanto cambia el segundo.
    await expect
      .poll(() => segundos!.evaluate((nodo) => nodo.isConnected), { timeout: 3000 })
      .toBe(false);
    await expect(bloques.nth(3).locator("div").first()).toHaveCSS("animation-name", "rodar");

    // Los días no han cambiado: el mismo nodo, sin volver a rodar.
    expect(await dias!.evaluate((nodo) => nodo.isConnected)).toBe(true);
  });

  test("con movimiento reducido las cifras cambian sin rodar", async ({ page }) => {
    await conMovimientoReducido(page);

    const cifra = page.getByRole("timer").locator("> div").nth(3).locator("div").first();
    await expect(cifra).toHaveCSS("animation-name", "aparecer");
    await expect(cifra).toHaveCSS("animation-duration", "0.1s");
  });

  /**
   * EL HILO DEL DÍA · con la primera hora a media pantalla, su hilo está
   * lleno y su hora en bronce; la última, muy por debajo, espera vacía y en
   * tinta tenue.
   */
  test("al bajar por el programa, el hilo se llena y cada hora se enciende", async ({
    page,
  }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const conLineaDeTiempo = await page.evaluate(() =>
      CSS.supports("animation-timeline: view()"),
    );
    test.skip(!conLineaDeTiempo, "Este navegador no tiene animaciones ligadas al scroll");

    const filas = page.locator("#programa ol > li");
    const primera = filas.first();
    const ultima = filas.last();
    const bronce = await primera
      .locator("span")
      .first()
      .evaluate((n) => getComputedStyle(n).color);

    // La fila, a un tercio de la pantalla. Sin suavizado: la página lleva
    // `scroll-behavior: smooth`, y dos desplazamientos suaves seguidos se pisan.
    await primera.evaluate((nodo) =>
      window.scrollTo({
        top: nodo.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3,
        behavior: "instant",
      }),
    );

    await expect
      .poll(() => primera.locator(".hora-que-llega").evaluate((n) => getComputedStyle(n).color))
      .toBe(bronce);
    await expect
      .poll(() =>
        primera
          .locator(".hilo-del-dia")
          .evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).d),
      )
      .toBe(1);

    // La última fila todavía no ha llegado: hilo vacío y hora apagada.
    const lejos = await ultima.evaluate((nodo) => ({
      hilo: new DOMMatrix(getComputedStyle(nodo.querySelector(".hilo-del-dia")!).transform).d,
      hora: getComputedStyle(nodo.querySelector(".hora-que-llega")!).color,
    }));
    expect(lejos.hilo).toBe(0);
    expect(lejos.hora).not.toBe(bronce);
  });

  test("con movimiento reducido no hay hilo y todas las horas van en bronce", async ({
    page,
  }) => {
    await conMovimientoReducido(page);

    const filas = page.locator("#programa ol > li");
    const bronce = await filas
      .first()
      .locator("span")
      .first()
      .evaluate((n) => getComputedStyle(n).color);
    const estado = await filas.evaluateAll((lis) =>
      lis.map((li) => ({
        hilo: getComputedStyle(li.querySelector(".hilo-del-dia")!).display,
        hora: getComputedStyle(li.querySelector(".hora-que-llega")!).color,
      })),
    );

    expect(estado.length).toBeGreaterThan(1);
    for (const fila of estado) {
      expect(fila.hilo).toBe("none");
      expect(fila.hora).toBe(bronce);
    }
  });

  /** Un botón cede un 3 % mientras se pulsa; con movimiento reducido, no. */
  async function escalaAlPulsar(page: Page): Promise<number> {
    const boton = page.locator("#portada").getByRole("link", {
      name: copy.portada.confirmarAsistencia,
    });
    await boton.scrollIntoViewIfNeeded();
    // Los botones suben al entrar: se espera a que paren para apuntarles.
    await entradaTerminada(boton.locator(".."));
    const caja = (await boton.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    // La transición dura 100 ms: se lee cuando ha llegado, no a mitad.
    await page.waitForTimeout(250);
    // La escala horizontal de la matriz: 1 es su tamaño, «none» incluido.
    const escala = await boton.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a);
    await page.mouse.up();
    return escala;
  }

  test("un botón cede al pulsarlo", async ({ page }) => {
    await page.goto("/");
    expect(await escalaAlPulsar(page)).toBeCloseTo(0.97, 2);
  });

  test("con movimiento reducido el botón no se mueve al pulsarlo", async ({ page }) => {
    await conMovimientoReducido(page);
    expect(await escalaAlPulsar(page)).toBe(1);
  });

  /**
   * Las tarjetas de una fila entran de izquierda a derecha: cada columna
   * empieza un paso después que la anterior, y la cuarta —primera de la fila
   * siguiente— vuelve a empezar como la primera.
   */
  test("las tarjetas de una fila entran escalonadas", async ({ page }) => {
    await page.goto("/");

    const conLineaDeTiempo = await page.evaluate(() =>
      CSS.supports("animation-timeline: view()"),
    );
    test.skip(!conLineaDeTiempo, "Este navegador no tiene animaciones ligadas al scroll");

    // La rejilla con más tarjetas: el seed no llena todas por igual.
    const inicios = await page.evaluate(() => {
      const listas = [...document.querySelectorAll(".escalonado")];
      const mayor = listas.sort((a, b) => b.children.length - a.children.length)[0];
      return [...(mayor?.children ?? [])].map((hija) =>
        getComputedStyle(hija).getPropertyValue("animation-range-start"),
      );
    });

    expect(inicios.length).toBeGreaterThan(1);
    expect(inicios[1]).not.toBe(inicios[0]);
    if (inicios.length > 3) expect(inicios[3]).toBe(inicios[0]);
  });
});
