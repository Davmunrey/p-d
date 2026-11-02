import postgres from "postgres";

import { expect, test, type Locator, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { RUTA_RSVP } from "../../src/config/constants";

/**
 * LA LANDING CUENTA EL DÍA, DE LA MAÑANA A LA NOCHE, BAJO LA LIRA
 *
 * La historia que se eligió: arriba es el alba y al bajar el fondo pasa por la
 * tarde dorada y el ocaso hasta la noche marino del final; los nombres emergen
 * como un título; «nuestra historia» enciende una estrella de la Lira por cada
 * hito; y al llegar al RSVP la Lira está entera y espera, hueca, la estrella
 * de los invitados, que se enciende en las gracias del RSVP si alguien viene.
 *
 * Cada gesto se prueba leyendo lo que el navegador tiene puesto, con su caso
 * de error: sin movimiento —o sin líneas de tiempo de scroll— todo está ya
 * dibujado y quieto, y la página es la de siempre.
 */

const cadena = process.env.DATABASE_URL;
const ESCRITORIO = { width: 1440, height: 900 };

async function conLineasDeTiempo(page: Page): Promise<boolean> {
  return page.evaluate(() => CSS.supports("animation-timeline: view()"));
}

async function conMovimientoReducido(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const activo = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  test.skip(!activo, "Este navegador no aplica la emulación de prefers-reduced-motion");
}

/** Baja a una fracción del recorrido total de la página, sin suavizado. */
async function bajarA(page: Page, fraccion: number): Promise<void> {
  await page.evaluate((f) => {
    const recorrido = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: recorrido * f, behavior: "instant" });
  }, fraccion);
  await page.waitForTimeout(300);
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
  await page.waitForTimeout(300);
}

const opacidad = (elemento: Locator) =>
  elemento.evaluate((nodo) => parseFloat(getComputedStyle(nodo).opacity));

test.describe("El cielo del día", () => {
  const capa = (page: Page, nombre: string) =>
    page.locator(`[data-cielo-del-dia] .cielo-${nombre}`);

  test("al bajar, el fondo pasa del alba a la tarde y al ocaso", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    test.skip(!(await conLineasDeTiempo(page)), "Sin animaciones ligadas al scroll");

    await expect(page.locator("[data-cielo-del-dia]")).toHaveAttribute("aria-hidden", "true");

    await bajarA(page, 0);
    expect(await opacidad(capa(page, "alba")), "arriba es el alba").toBeGreaterThan(0.9);
    expect(await opacidad(capa(page, "tarde"))).toBe(0);

    await bajarA(page, 0.55);
    expect(await opacidad(capa(page, "tarde")), "a media página, la tarde").toBeGreaterThan(
      0.9,
    );
    expect(await opacidad(capa(page, "alba"))).toBe(0);

    await bajarA(page, 1);
    expect(await opacidad(capa(page, "ocaso")), "al final, el ocaso").toBeGreaterThan(0.9);
    expect(await opacidad(capa(page, "tarde"))).toBeLessThan(0.1);
    expect(await opacidad(capa(page, "sol")), "el sol ya se ha puesto").toBe(0);
  });

  /** CASO DE ERROR · sin movimiento, no hay cielo: la página es la de siempre. */
  test("con movimiento reducido no se pinta ninguna luz", async ({ page }) => {
    await conMovimientoReducido(page);
    for (const fraccion of [0, 0.55, 1]) {
      await bajarA(page, fraccion);
      for (const nombre of ["alba", "tarde", "ocaso", "sol"]) {
        expect(await opacidad(capa(page, nombre)), `${nombre} a ${fraccion}`).toBe(0);
      }
    }
  });
});

test.describe("La portada entra como un título", () => {
  test("cada nombre emerge de su línea con la pausa de su línea", async ({ page }) => {
    await page.goto("/");
    const lineas = page.locator("#portada .linea-que-emerge");
    await expect(lineas).toHaveCount(2);

    const estado = await lineas.evaluateAll((nodos) =>
      nodos.map((nodo) => ({
        nombre: getComputedStyle(nodo).animationName,
        retardo: parseFloat(getComputedStyle(nodo).animationDelay),
        recorte: getComputedStyle(nodo.parentElement!).clipPath,
      })),
    );
    expect(estado.map((e) => e.nombre)).toEqual(["emerger-linea", "emerger-linea"]);
    // Las pausas de `retardo-2` y `retardo-3`: emergen a la vez que su línea.
    expect(estado.map((e) => e.retardo)).toEqual([0.35, 0.5]);
    for (const e of estado) expect(e.recorte, "la máscara recorta").toContain("inset(");
  });

  test("al bajar, el texto de la portada se adelanta", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    test.skip(!(await conLineasDeTiempo(page)), "Sin animaciones ligadas al scroll");

    const texto = page.locator("#portada .salida-portada");
    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight / 2, behavior: "instant" }),
    );
    await page.waitForTimeout(300);
    const salida = await texto.evaluate((nodo) => ({
      y: new DOMMatrix(getComputedStyle(nodo).transform).f,
      opacidad: parseFloat(getComputedStyle(nodo).opacity),
    }));
    expect(salida.y, "sube más deprisa que la página").toBeLessThan(0);
    expect(salida.opacidad).toBeLessThan(1);
  });

  /** CASO DE ERROR · con movimiento reducido, los nombres ya están y nada se va. */
  test("con movimiento reducido los nombres no emergen y la portada no se va", async ({
    page,
  }) => {
    await conMovimientoReducido(page);
    const nombres = await page
      .locator("#portada .linea-que-emerge")
      .evaluateAll((nodos) => nodos.map((nodo) => getComputedStyle(nodo).animationName));
    expect(new Set(nombres)).toEqual(new Set(["aparecer"]));

    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight / 2, behavior: "instant" }),
    );
    await page.waitForTimeout(300);
    expect(
      await page
        .locator("#portada .salida-portada")
        .evaluate((n) => getComputedStyle(n).transform),
    ).toBe("none");
  });
});

test.describe("Nuestra historia enciende la Lira", () => {
  const estrellas = (page: Page) => page.locator("#historia .estrella-historia");
  const hitos = (page: Page) => page.locator("#historia ol > li");

  test("cada hito enciende su estrella, y el último completa la Lira", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    test.skip(!(await conLineasDeTiempo(page)), "Sin animaciones ligadas al scroll");

    const cuantos = await hitos(page).count();
    test.skip(cuantos === 0, "La base no tiene hitos publicados");
    await expect(estrellas(page)).toHaveCount(5);

    // Con el texto del primer hito a media pantalla —su fila empieza arriba y
    // el texto va centrado en ella—, su estrella está encendida y la última
    // de la Lira todavía duerme (si hay más de un hito).
    await ponerA(page, hitos(page).first(), 0.1);
    expect(await opacidad(estrellas(page).first()), "la estrella del primer hito").toBeCloseTo(
      1,
      1,
    );
    if (cuantos > 1) {
      expect(await opacidad(estrellas(page).last()), "la última aún duerme").toBeLessThan(0.5);
    }

    // Pasado el último hito, la Lira está entera y llega el cierre.
    // El último hito ya subiendo: es cuando se cierra el último trazo.
    await ponerA(page, hitos(page).last(), -0.2);
    for (const opacidadEstrella of await estrellas(page).evaluateAll((nodos) =>
      nodos.map((nodo) => parseFloat(getComputedStyle(nodo).opacity)),
    )) {
      expect(opacidadEstrella).toBeCloseTo(1, 1);
    }
    const trazos = await page
      .locator("#historia .trazo-historia")
      .evaluateAll((nodos) =>
        nodos.map((n) => parseFloat(getComputedStyle(n).strokeDashoffset)),
      );
    expect(new Set(trazos), "todos los trazos dibujados").toEqual(new Set([0]));
    await expect(page.locator("#historia").getByText(copy.historia.cierre)).toBeVisible();
  });

  test("la historia se sigue leyendo como una lista, y el escenario es decoración", async ({
    page,
  }) => {
    await page.goto("/");
    const cuantos = await hitos(page).count();
    test.skip(cuantos === 0, "La base no tiene hitos publicados");
    await expect(page.locator("#historia [aria-hidden] svg")).toHaveCount(1);
    await expect(page.locator("#historia ol").getByRole("listitem")).toHaveCount(cuantos);
  });

  /** CASO DE ERROR · con movimiento reducido, la Lira está entera desde el principio. */
  test("con movimiento reducido la Lira está entera y sin halos", async ({ page }) => {
    await conMovimientoReducido(page);
    test.skip((await hitos(page).count()) === 0, "La base no tiene hitos publicados");
    const estado = await page.evaluate(() => ({
      estrellas: [...document.querySelectorAll("#historia .estrella-historia")].map((n) =>
        parseFloat(getComputedStyle(n).opacity),
      ),
      halos: [...document.querySelectorAll("#historia .halo-historia")].map((n) =>
        parseFloat(getComputedStyle(n).opacity),
      ),
    }));
    expect(new Set(estado.estrellas)).toEqual(new Set([1]));
    expect(new Set(estado.halos)).toEqual(new Set([0]));
  });
});

test.describe("La noche del final", () => {
  test("al llegar, la Lira se dibuja y espera vuestra estrella", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    const rsvp = page.locator("#rsvp");
    test.skip((await rsvp.count()) === 0, "El RSVP está apagado en la base");

    await expect(rsvp.getByText(copy.rsvp.faltaVuestraEstrella)).toBeAttached();
    const lira = rsvp.locator('svg[data-vuestra-estrella="falta"]');
    await expect(lira).toHaveAttribute("aria-hidden", "true");
    expect(
      await rsvp.locator(".latido-estrella").evaluate((n) => getComputedStyle(n).animationName),
      "vuestra estrella late",
    ).toBe("latir-estrella");

    if (await conLineasDeTiempo(page)) {
      await ponerA(page, rsvp, 0.15);
      const trazos = await lira
        .locator(".trazo-lira")
        .evaluateAll((n) => n.map((x) => parseFloat(getComputedStyle(x).strokeDashoffset)));
      expect(new Set(trazos), "la Lira ya está dibujada").toEqual(new Set([0]));
      expect(
        await rsvp
          .locator(".estrella-fugaz")
          .evaluate((n) => getComputedStyle(n).animationName),
      ).toBe("cruzar-fugaz");
    }
  });

  /** CASO DE ERROR · con movimiento reducido, ni late ni cruza ninguna estrella. */
  test("con movimiento reducido vuestra estrella no late y no hay estrella fugaz", async ({
    page,
  }) => {
    await conMovimientoReducido(page);
    const rsvp = page.locator("#rsvp");
    test.skip((await rsvp.count()) === 0, "El RSVP está apagado en la base");
    expect(
      await rsvp.locator(".latido-estrella").evaluate((n) => getComputedStyle(n).animationName),
    ).toBe("none");
    expect(await opacidad(rsvp.locator(".estrella-fugaz"))).toBe(0);
  });
});

/**
 * EL FINAL DE LA HISTORIA, EN EL RSVP. Si alguien del grupo viene, las gracias
 * llevan la Lira con su estrella encendida; si no viene nadie, la Lira de
 * siempre, sin estrella. Se fabrican dos grupos con su respuesta para no
 * depender del estado en que otros tests dejen los del seed.
 */
test.describe("Vuestra estrella en las gracias del RSVP", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para fabricar las invitaciones.");

  async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      return await trabajo(sql);
    } finally {
      await sql.end();
    }
  }

  /** Un grupo de una persona que ya ha contestado. Devuelve su token. */
  async function grupoQueResponde(sufijo: string, estado: "confirmado" | "rechazado") {
    const token = `desarrollo-e2e-estrella-${sufijo}-000000`;
    await conBase(async (sql) => {
      const [grupo] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
        values (
          ${`(DES) Grupo e2e-estrella-${sufijo}`}, 'ambos',
          array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
          public.huella_token(${token})
        )
        returning id
      `;
      const [persona] = await sql<{ id: string }[]>`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        values (${grupo.id}, '(DES) Estrella', '(DES)', false)
        returning id
      `;
      await sql`
        insert into public.confirmaciones
          (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
        values (${persona.id}, ${estado}, 'publico', false, false)
      `;
    });
    return token;
  }

  test.afterAll(async () => {
    if (!cadena) return;
    await conBase(
      (sql) =>
        sql`delete from public.grupos_invitacion where nombre like '(DES) Grupo e2e-estrella-%'`,
    );
  });

  test("si alguien viene, su estrella se enciende junto a la Lira", async ({ page }) => {
    const token = await grupoQueResponde("si", "confirmado");
    await page.setViewportSize(ESCRITORIO);
    await page.goto(`${RUTA_RSVP}/${token}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await expect(page.locator('svg[data-vuestra-estrella="encendida"]')).toBeVisible();
    await expect(page.getByText(copy.rsvp.estrellaEncendida)).toBeVisible();
  });

  /** CASO DE ERROR · si no viene nadie, no hay estrella que encender. */
  test("si no viene nadie, la Lira se queda sin vuestra estrella", async ({ page }) => {
    const token = await grupoQueResponde("no", "rechazado");
    await page.setViewportSize(ESCRITORIO);
    await page.goto(`${RUTA_RSVP}/${token}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasNo);
    await expect(page.locator("[data-vuestra-estrella]")).toHaveCount(0);
    await expect(page.getByText(copy.rsvp.estrellaEncendida)).toHaveCount(0);
  });
});
