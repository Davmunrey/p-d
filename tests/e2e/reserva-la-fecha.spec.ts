import postgres from "postgres";

import { expect, test, type Page } from "./utiles/origen-propio";

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
 * Lo primero que se manda a quien aún no tiene invitación: un sobre de noche,
 * bajo el cielo de la landing, con el retrato de estrellas de Paloma, Hati y
 * David en la solapa y un lacre que, al tocarlo, suelta la tarjeta con quién,
 * cuándo y dónde. De aquí no se salta a la web: la web llega con la
 * invitación. Se
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

const cadenaBase = process.env.DATABASE_URL;

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadenaBase!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

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
    // `exact`: la cabecera, y no otro texto que lo diga de pasada.
    await expect(page.getByText(copy.saveTheDate.etiqueta, { exact: true })).toBeVisible();
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

    // Fuera, el nombre de la pieza; dentro, la noticia. «Nos casamos» encima de
    // los nombres, y «Save the date» sólo en la cabecera: no se repite.
    await expect(
      tarjeta(page).getByText(copy.saveTheDate.anuncio, { exact: true }),
    ).toBeVisible();
    await expect(
      tarjeta(page).getByText(copy.saveTheDate.etiqueta, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(copy.saveTheDate.etiqueta, { exact: true })).toHaveCount(1);

    // La fecha entera es la protagonista: «26 · 06 · 2027» grande, con el día
    // de la semana encima, y en palabras para quien no ve la tarjeta.
    const fecha = tarjeta(page).locator("time");
    await expect(fecha).toBeVisible();
    await expect(fecha).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
    await expect(fecha.locator("[aria-hidden='true']")).toHaveText(/^\d{2} · \d{2} · \d{4}$/);
    await expect(fecha.locator(".sr-only")).toHaveText(
      /^[A-ZÁÉÍÓÚ][a-záéíóúñ]+ \d{1,2} de [a-záéíóú]+ de \d{4}$/,
    );

    // CASO DE ERROR · El año ya no va suelto: era lo que más se veía.
    await expect(tarjeta(page).getByText(/^\d{4}$/)).toHaveCount(0);
    // Y la fecha cabe en una línea: con dos, el año volvería a quedarse solo.
    const lineas = await fecha.evaluate((nodo) => {
      const visible = nodo.querySelector("[aria-hidden='true']")!;
      return visible.getClientRects().length;
    });
    expect(lineas).toBe(1);

    await expect(page.getByText(/\(DES\).*[Ff]inca/).first()).toBeVisible();

    // El pie: el calendario y la forma de cerrarlo. Nada más.
    await expect(
      page.getByRole("link", { name: copy.saveTheDate.anadirCalendario }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.saveTheDate.volverAlSobre }),
    ).toBeVisible();

    // El sobre se ha ido y no se puede volver a tocar; el foco está en la tarjeta.
    await expect(page.locator(".sobre")).toHaveAttribute("inert", "");
    await expect(tarjeta(page)).toBeFocused();
  });

  /**
   * La tarjeta dice la fecha y basta: los novios quitaron la cuenta atrás del
   * pie. Contar los segundos es cosa de la web, no del Save the Date.
   */
  test("la tarjeta lleva la fecha y no una cuenta atrás, y todo cabe en el marco", async ({
    page,
  }) => {
    await abrirElSobre(page);

    await expect(tarjeta(page).locator("time")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveCount(0);

    // Lo impreso queda dentro del marco interior: nada lo pisa ni se sale.
    await expect
      .poll(() =>
        tarjeta(page).evaluate((naipe) => {
          const marco = naipe.querySelector(".tarjeta > [aria-hidden='true']")!;
          const { top, bottom } = marco.getBoundingClientRect();
          return [...naipe.querySelectorAll(".tarjeta-contenido > *")].every((hijo) => {
            const caja = hijo.getBoundingClientRect();
            return caja.top >= top && caja.bottom <= bottom;
          });
        }),
      )
      .toBe(true);
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
        const calendario = await page
          .getByRole("link", { name: copy.saveTheDate.anadirCalendario })
          .boundingBox();
        const ventana = page.viewportSize()!;
        return {
          tarjetaEntera: !!naipe && naipe.y >= 0 && naipe.y + naipe.height <= ventana.height,
          calendarioALaVista: !!calendario && calendario.y < ventana.height,
        };
      })
      .toEqual({ tarjetaEntera: true, calendarioALaVista: true });

    const abierto = await medir(page);
    expect(abierto.anchoDocumento).toBeLessThanOrEqual(abierto.anchoVentana + 1);
  });

  /**
   * CASO DE ERROR · De aquí no se salta a la web.
   *
   * Lo pidieron los novios: el Save the Date va a quien aún no tiene
   * invitación, y la web llega con ella. Ni «ver la web», ni una nota que
   * mande allí, ni el `URL:` del evento, que el calendario pinta como enlace.
   * El único enlace de la página es el del calendario.
   */
  test("de aquí no se salta a la web, ni por el calendario", async ({ page, request }) => {
    await abrirElSobre(page);
    const destinos = await page
      .locator("a[href]")
      .evaluateAll((enlaces) => enlaces.map((enlace) => enlace.getAttribute("href")));
    expect(destinos).toEqual([RUTA_CALENDARIO]);

    const ics = await (await request.get(RUTA_CALENDARIO)).text();
    expect(ics).not.toMatch(/^URL:/m);
  });

  test("es de noche: el bloque inverso con el cielo de la landing girando", async ({
    page,
  }) => {
    await expect(page.locator("main")).toHaveAttribute("data-seccion", "inversa");
    const cielo = page.locator("main canvas[data-cielo-estrellado]");
    await expect(cielo).toHaveCount(1);
    await expect(cielo).toHaveAttribute("data-cielo", "vivo");
    // Aquí no se baja: gira solo.
    const giro = () => cielo.evaluate((nodo) => Number(nodo.getAttribute("data-giro")));
    const antes = await giro();
    await expect.poll(giro, { timeout: 4000 }).toBeGreaterThan(antes);

    // La tarjeta, en cambio, es papel claro: su texto no hereda la tinta de noche.
    const papel = page.locator(".tarjeta");
    await expect(papel).toHaveAttribute("data-seccion", "papel");
    const [tinta, fondoMain] = await Promise.all([
      papel.locator("h1").evaluate((nodo) => getComputedStyle(nodo).color),
      page.locator("main").evaluate((nodo) => getComputedStyle(nodo).color),
    ]);
    expect(tinta).not.toBe(fondoMain);
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
 * EL RETRATO DE ESTRELLAS EN EL SOBRE, Y NI RASTRO DE LA LIRA
 *
 * Paloma, Hati y David —el contorno de su foto, en estrellas— van impresos en
 * la solapa y en la tarjeta, donde estaba la Lira. Si la base no tiene ningún
 * retrato publicado, se pone uno para la prueba y se quita al acabar: lo que
 * se comprueba es que la página pinta el que hay, con su texto alternativo.
 */
test.describe("El retrato de estrellas en el sobre", () => {
  test.skip(!cadenaBase, "Hace falta DATABASE_URL para leer el retrato.");

  const RUTA_RETRATO = "retrato/e2e-reserva-la-fecha.png";
  let alternativo = "";

  test.beforeAll(async () => {
    await conBase(async (sql) => {
      const [primero] = await sql<{ alternativo: string }[]>`
        select texto_alternativo ->> 'es' as alternativo
          from public.medios
         where publicado and seccion = 'retrato' and tipo = 'imagen' and estrellas is not null
         order by orden nulls last, creado_en
         limit 1
      `;
      if (primero) {
        alternativo = primero.alternativo;
        return;
      }
      alternativo = "(DES) Retrato de prueba del Save the Date";
      const estrellas = {
        proporcion: 0.9,
        estrellas: Array.from({ length: 60 }, (_, i) => {
          const angulo = (i / 60) * 2 * Math.PI;
          return [
            Number((0.5 + 0.45 * Math.cos(angulo)).toFixed(4)),
            Number((0.5 + 0.45 * Math.sin(angulo)).toFixed(4)),
            i % 10 === 0 ? 1 : 0.6,
          ];
        }),
      };
      await sql`
        insert into public.medios
          (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado, orden, ancho, alto, estrellas)
        select ${RUTA_RETRATO}, ${sql.json({ es: alternativo })}, 'retrato', 'imagen', true,
               coalesce(max(orden), -1) + 1, 900, 1000, ${sql.json(estrellas)}
          from public.medios where seccion = 'retrato'
      `;
    });
  });

  test.afterAll(async () => {
    if (!cadenaBase) return;
    await conBase(
      (sql) => sql`delete from public.medios where ruta_almacenamiento = ${RUTA_RETRATO}`,
    );
  });

  test("va en la solapa y en la tarjeta, donde estaba la Lira", async ({ page }) => {
    await page.goto(RUTA);
    await expect(page.locator(".solapa-retrato svg circle").first()).toBeAttached();
    await expect(page.locator(".solapa-lira")).toHaveCount(0);
    // En la solapa es adorno: el lector de pantalla lo oye una vez, en la tarjeta.
    await expect(page.locator(".solapa-retrato")).toHaveAttribute("aria-hidden", "true");

    await abrirElSobre(page);
    const retrato = tarjeta(page).getByRole("img", { name: alternativo });
    await expect(retrato).toBeVisible();
    // Ni una constelación de la marca en toda la pieza: sólo el retrato.
    await expect(pieza(page).locator(".fill-constelacion-estrella")).toHaveCount(0);
  });

  test("al salir la tarjeta, el retrato se dibuja entero", async ({ page }) => {
    await page.goto(RUTA);
    const trazado = () =>
      tarjeta(page)
        .locator(".trazado-del-naipe")
        .evaluate((nodo) => Number(getComputedStyle(nodo).getPropertyValue("--trazado")));
    // Guardado en el sobre, sin dibujar.
    expect(await trazado()).toBe(0);
    await abrirElSobre(page);
    await expect.poll(trazado, { timeout: 5000 }).toBe(1);
  });
});

/**
 * LA BARAJA DE CROMOS DEL MÓVIL.
 *
 * En el móvil, la ilustración y la tarjeta salen del sobre en el mismo sitio,
 * como dos cromos en la mano: la tarjeta delante y la ilustración asomando
 * detrás. Se pasan deslizando, tocando o con el botón «Ver la otra tarjeta».
 * Desde tableta, una al lado de la otra y sin baraja. Se mira con el sobre
 * servido ya abierto (`?abierto`) y con las cajas de verdad.
 */
test.describe("La baraja del Save the Date", () => {
  const foto = (page: Page) => page.locator(".naipe-foto");
  const otraTarjeta = (page: Page) =>
    page.getByRole("button", { name: copy.saveTheDate.otraTarjeta });

  /**
   * Cuenta los fundidos de página en curso. Al llegar, React revela el
   * contenido con un fundido (`<ViewTransition>` del layout) que dura algo más
   * de un segundo y empieza cuando le toca —a veces después de hidratar—; y
   * mientras dura, el navegador no deja tocar la página: el toque va a la
   * capa del fundido. Un `click()` de Playwright lo espera solo; un arrastre
   * hecho a mano, no.
   */
  async function vigilarFundidos(page: Page) {
    await page.addInitScript(() => {
      const ventana = window as typeof window & {
        fundidos?: { activos: number; acabados: number };
      };
      const fundidos = { activos: 0, acabados: 0 };
      ventana.fundidos = fundidos;
      const iniciar = document.startViewTransition?.bind(document);
      if (!iniciar) return;
      document.startViewTransition = ((opciones) => {
        const transicion = iniciar(opciones);
        fundidos.activos++;
        void transicion.finished.finally(() => {
          fundidos.activos--;
          fundidos.acabados++;
        });
        return transicion;
      }) as typeof document.startViewTransition;
    });
  }

  /**
   * Espera a que la tarjeta se pueda coger con el dedo: hidratada, sin
   * fundido en curso —o pasados dos segundos sin que haya empezado ninguno—
   * y siendo ella lo que hay bajo el dedo.
   */
  async function esperarATocable(page: Page) {
    await expect(pieza(page)).toHaveAttribute("data-hidratado", "");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { fundidos } = window as typeof window & {
            fundidos?: { activos: number; acabados: number };
          };
          return (
            !!fundidos &&
            fundidos.activos === 0 &&
            (fundidos.acabados > 0 || performance.now() > 2000)
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        tarjeta(page).evaluate((naipe) => {
          const caja = naipe.getBoundingClientRect();
          const centro = document.elementFromPoint(
            caja.x + caja.width / 2,
            caja.y + caja.height / 2,
          );
          return naipe.contains(centro);
        }),
      )
      .toBe(true);
  }

  async function abrirEnElMovil(page: Page) {
    await vigilarFundidos(page);
    await page.setViewportSize(MOVIL);
    await page.goto(`${RUTA}?${PARAMETRO_SOBRE_ABIERTO}`);
    await esperarATocable(page);
  }

  /** Arrastra el cromo de delante en horizontal, desde su centro. */
  async function arrastrar(page: Page, recorrido: number) {
    const caja = (await page.locator('.naipe[data-cromo="delante"]').boundingBox())!;
    const x = caja.x + caja.width / 2;
    const y = caja.y + caja.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let paso = 1; paso <= 8; paso++) await page.mouse.move(x + (recorrido * paso) / 8, y);
    await page.mouse.up();
  }

  test("en el móvil salen en el mismo sitio, la tarjeta delante y entera", async ({ page }) => {
    await abrirEnElMovil(page);
    await expect(tarjeta(page)).toHaveAttribute("data-cromo", "delante");
    await expect(foto(page)).toHaveAttribute("data-cromo", "detras");

    // Una encima de otra: los centros casi coinciden y se pisan.
    await expect
      .poll(async () => {
        const delante = (await tarjeta(page).boundingBox())!;
        const detras = (await foto(page).boundingBox())!;
        return (
          Math.abs(delante.x + delante.width / 2 - (detras.x + detras.width / 2)) <
          delante.width / 4
        );
      })
      .toBe(true);

    // La de delante, entera en la pantalla y por encima de la otra.
    const delante = (await tarjeta(page).boundingBox())!;
    expect(delante.x).toBeGreaterThanOrEqual(0);
    expect(delante.x + delante.width).toBeLessThanOrEqual(MOVIL.width);
    expect(delante.y + delante.height).toBeLessThanOrEqual(MOVIL.height);
    const capa = (naipe: ReturnType<typeof foto>) =>
      naipe.evaluate((elemento) => Number(getComputedStyle(elemento).zIndex));
    expect(await capa(tarjeta(page))).toBeGreaterThan(await capa(foto(page)));

    // Y el botón dice cuál va delante, sin scroll horizontal.
    await expect(otraTarjeta(page)).toBeVisible();
    const { anchoDocumento, anchoVentana } = await medir(page);
    expect(anchoDocumento).toBeLessThanOrEqual(anchoVentana + 1);
  });

  test("se pasan con el botón y con el teclado", async ({ page }) => {
    await abrirEnElMovil(page);
    await otraTarjeta(page).click();
    await expect(foto(page)).toHaveAttribute("data-cromo", "delante");
    await expect(tarjeta(page)).toHaveAttribute("data-cromo", "detras");
    await expect(pieza(page)).toHaveAttribute("data-barajada", "");

    await otraTarjeta(page).focus();
    await page.keyboard.press("Enter");
    await expect(tarjeta(page)).toHaveAttribute("data-cromo", "delante");
  });

  test("se pasan deslizando, y tocando el de detrás vuelve delante", async ({ page }) => {
    await abrirEnElMovil(page);
    await arrastrar(page, -MOVIL.width / 2);
    await expect(foto(page)).toHaveAttribute("data-cromo", "delante");
    // Al soltar no le queda nada escrito a mano: lo coloca el CSS.
    await expect(tarjeta(page)).toHaveAttribute("style", "");

    /*
      Ya posada detrás, la tarjeta asoma por la izquierda: tocar esa franja la
      trae. Se toca en mitad de la franja, a media altura, que es donde pone
      el dedo una persona; en el filo de una esquina girada cada navegador
      decide a su manera de quién es el píxel.
    */
    await expect
      .poll(() => tarjeta(page).evaluate((naipe) => naipe.getAnimations().length))
      .toBe(0);
    const asoma = await tarjeta(page).evaluate((naipe) => {
      const caja = naipe.getBoundingClientRect();
      const y = caja.top + caja.height / 2;
      let desde: number | null = null;
      for (let x = caja.left; x < caja.right; x += 2) {
        const suya = naipe.contains(document.elementFromPoint(x, y));
        if (suya && desde === null) desde = x;
        if (!suya && desde !== null) return { x: (desde + x) / 2, y };
      }
      return null;
    });
    expect(asoma, "la tarjeta asoma por detrás de la ilustración").not.toBeNull();
    await page.mouse.click(asoma!.x, asoma!.y);
    await expect(tarjeta(page)).toHaveAttribute("data-cromo", "delante");
  });

  /**
   * CASO DE ERROR · Un arrastre corto no pasa el cromo.
   *
   * Si el dedo se arrepiente a medio camino, el cromo vuelve a su sitio: lo
   * contrario sería pasar de tarjeta cada vez que alguien roza la pantalla.
   */
  test("un arrastre corto no la pasa: vuelve a su sitio", async ({ page }) => {
    await abrirEnElMovil(page);
    const antes = (await tarjeta(page).boundingBox())!;
    await page.mouse.move(antes.x + antes.width / 2, antes.y + antes.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(antes.x + antes.width / 2 - 30, antes.y + antes.height / 2, {
      steps: 6,
    });
    await page.waitForTimeout(400);
    await page.mouse.up();

    await expect(tarjeta(page)).toHaveAttribute("data-cromo", "delante");
    await expect
      .poll(async () => Math.round((await tarjeta(page).boundingBox())!.x))
      .toBe(Math.round(antes.x));
  });

  /**
   * CASO DE ERROR · En escritorio no hay baraja.
   *
   * Uno al lado del otro, sin botón, y arrastrar la tarjeta no la mueve.
   */
  test("desde tableta salen una al lado de la otra y no se barajan", async ({ page }) => {
    await vigilarFundidos(page);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${RUTA}?${PARAMETRO_SOBRE_ABIERTO}`);
    await esperarATocable(page);
    const izquierda = (await foto(page).boundingBox())!;
    const derecha = (await tarjeta(page).boundingBox())!;
    expect(izquierda.x + izquierda.width).toBeLessThanOrEqual(derecha.x);
    await expect(otraTarjeta(page)).toBeHidden();

    await arrastrar(page, -300);
    await expect(tarjeta(page)).toHaveAttribute("data-cromo", "delante");
    expect((await tarjeta(page).boundingBox())!.x).toBeCloseTo(derecha.x, 0);
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

    /*
      SE PULSA CON `force`, Y SÓLO EN ESTE TEST. Con el JavaScript de la página
      apagado, las comprobaciones que Playwright hace antes de pulsar —que el
      elemento esté quieto, que sea él quien recibe el puntero— no llegan a
      cerrarse: se quedan esperando a que el escenario, que entra con una
      escala de 1,3 s, «se estabilice», y agotan el tiempo entero.

      No se afloja nada que este fichero no compruebe ya. Que el sello se ve y
      que se pulsa de la forma normal lo afirman los tests de arriba, que corren
      en los dos navegadores. Lo que se comprueba AQUÍ es otra cosa —que el
      formulario GET recarga la página con el parámetro puesto, sin una línea de
      script— y para eso el estado de la animación da igual.
    */
    await sello(page).click({ force: true });

    await expect(page).toHaveURL(new RegExp(`\\?${PARAMETRO_SOBRE_ABIERTO}=1`));
    await expect(pieza(page)).toHaveAttribute("data-fuera", "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES)");
    await expect(tarjeta(page).locator("time")).toBeVisible();
    await expect(
      page.getByRole("link", { name: copy.saveTheDate.anadirCalendario }),
    ).toBeVisible();

    // Y volver a cerrarlo es cargar la página sin el parámetro.
    await page
      .getByRole("button", { name: copy.saveTheDate.volverAlSobre })
      .click({ force: true });
    await expect(page).not.toHaveURL(new RegExp(PARAMETRO_SOBRE_ABIERTO));
    await expect(sello(page)).toBeVisible();
    await expect(tarjeta(page)).toHaveAttribute("inert", "");
  });

  /*
    La baraja es del JavaScript: sin él, en el móvil, las dos van una debajo
    de otra —la ilustración arriba—, enteras, y sin un botón que no haría nada.
  */
  test("en el móvil, la ilustración y la tarjeta van una debajo de otra", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto(`${RUTA}?${PARAMETRO_SOBRE_ABIERTO}`);
    const foto = (await page.locator(".naipe-foto").boundingBox())!;
    const escrita = (await tarjeta(page).boundingBox())!;
    expect(foto.y + foto.height).toBeLessThanOrEqual(escrita.y);
    for (const caja of [foto, escrita]) {
      expect(caja.x).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width).toBeLessThanOrEqual(MOVIL.width);
    }
    await expect(page.getByRole("button", { name: copy.saveTheDate.otraTarjeta })).toBeHidden();
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

  test("la baraja del móvil cambia de cromo sin hacerlo volar", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto(`${RUTA}?${PARAMETRO_SOBRE_ABIERTO}`);
    await expect(pieza(page)).toHaveAttribute("data-hidratado", "");
    await page.getByRole("button", { name: copy.saveTheDate.otraTarjeta }).click();
    // Sin vuelo no hay `data-lanzado` en ningún momento: el cambio es directo.
    await expect(page.locator(".naipe-foto")).toHaveAttribute("data-cromo", "delante", {
      timeout: 200,
    });
    await expect(pieza(page)).not.toHaveAttribute("data-lanzado", /.+/);
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
