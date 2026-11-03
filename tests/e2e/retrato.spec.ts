import postgres from "postgres";

import { expect, test, type Page } from "./utiles/origen-propio";
import { conSeccionApagada } from "./utiles/secciones";

/**
 * EL RETRATO DE ESTRELLAS, AL FINAL DE LA NOCHE
 *
 * El contorno de una foto recortada, hecho estrellas, de pie sobre el
 * horizonte: lo último de la noche, justo antes del amanecer. Se dibuja al
 * bajar —cada estrella se enciende cuando el trazado llega a ella— y lo
 * dibujado se queda dibujado. Sin JavaScript o sin movimiento, está entero.
 *
 * El test se fabrica su retrato en la base —un círculo de estrellas con
 * algunas principales—, que es lo que el panel guarda al subir una foto
 * recortada: aquí se prueba lo que la landing hace con él. Cómo se calcula
 * desde la foto lo prueban los unitarios de `src/lib/retrato/`.
 */

const cadena = process.env.DATABASE_URL;
const RUTA = "desarrollo/e2e-retrato.png";
const ALTERNATIVO = "(DES) Tres figuras de prueba en la nieve";
const CUANTAS = 60;

/** Un círculo de estrellas; una de cada diez, principal. */
const ESTRELLAS = {
  proporcion: 0.8,
  estrellas: Array.from({ length: CUANTAS }, (_, i) => {
    const angulo = (i / CUANTAS) * 2 * Math.PI - Math.PI / 2;
    return [
      Number((0.5 + 0.5 * Math.cos(angulo)).toFixed(4)),
      Number((0.5 + 0.5 * Math.sin(angulo)).toFixed(4)),
      i % 10 === 0 ? 1 : 0.5,
    ];
  }),
};

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

async function ponerRetrato(publicado: boolean): Promise<void> {
  await conBase(async (sql) => {
    await sql`delete from public.medios where ruta_almacenamiento = ${RUTA}`;
    await sql`
      insert into public.medios
        (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado, orden, ancho, alto, estrellas)
      values (
        ${RUTA}, ${sql.json({ es: ALTERNATIVO })}, 'retrato', 'imagen', ${publicado}, 0,
        800, 1000, ${sql.json(ESTRELLAS)}
      )
    `;
  });
}

const retrato = (pagina: Page) => pagina.locator("[data-retrato]");
const estrellas = (pagina: Page) => retrato(pagina).locator(".estrella-del-retrato");
const opacidad = (pagina: Page, cual: number) =>
  estrellas(pagina)
    .nth(cual)
    .evaluate((nodo) => Number(getComputedStyle(nodo).opacity));

/** Deja la parte de arriba del retrato a `fraccion` del alto de la pantalla. */
async function bajarHasta(pagina: Page, fraccion: number): Promise<void> {
  await retrato(pagina).evaluate((nodo, f) => {
    const arriba = nodo.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: arriba - window.innerHeight * f, behavior: "instant" });
  }, fraccion);
}

test.describe.configure({ mode: "serial" });

test.describe("El retrato de estrellas", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para poner el retrato.");

  test.beforeEach(async () => {
    await ponerRetrato(true);
  });

  test.afterAll(async () => {
    if (cadena)
      await conBase(
        (sql) => sql`delete from public.medios where ruta_almacenamiento = ${RUTA}`,
      );
  });

  test("cierra la noche, de pie sobre el horizonte, y se oye su texto alternativo", async ({
    page,
  }) => {
    await page.goto("/");
    const figura = retrato(page);

    await expect(figura).toHaveCount(1);
    await expect(figura).toHaveAttribute("role", "img");
    await expect(figura).toHaveAttribute("aria-label", ALTERNATIVO);
    await expect(estrellas(page)).toHaveCount(CUANTAS);
    // Las principales, con su halo: una de cada diez.
    await expect(figura.locator("[data-principal]")).toHaveCount(CUANTAS / 10);

    const sitio = await figura.evaluate((nodo) => ({
      enLaNoche: nodo.parentElement?.getAttribute("data-tramo") === "noche",
      loUltimo: nodo.parentElement?.lastElementChild === nodo,
      hastaElHorizonte: Math.abs(
        nodo.getBoundingClientRect().bottom -
          document.querySelector("[data-amanecer]")!.getBoundingClientRect().top,
      ),
    }));
    expect(sitio.enLaNoche).toBe(true);
    expect(sitio.loUltimo).toBe(true);
    expect(sitio.hastaElHorizonte).toBeLessThanOrEqual(1);

    // Es cielo, no una sección: ni titular, ni ancla, ni sitio en el menú.
    await expect(page.locator("section#retrato")).toHaveCount(0);
    await expect(page.locator('a[href="#retrato"]')).toHaveCount(0);
  });

  test("se dibuja al bajar, en el orden del contorno, y lo dibujado se queda", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const trazado = retrato(page).locator("[data-trazado]");

    // Con la foto de portada el retrato queda por debajo al llegar: lo traza
    // el scroll, no se dibuja solo.
    await expect(trazado).toHaveAttribute("data-al-bajar", "");

    // Lejos todavía: apagado.
    await bajarHasta(page, 2);
    await expect(trazado).toHaveAttribute("data-trazado", "dibujando");
    await expect.poll(() => opacidad(page, 0)).toBe(0);

    // A medias: la primera encendida y la última todavía no.
    await bajarHasta(page, 0.55);
    await expect.poll(() => opacidad(page, 0)).toBeGreaterThan(0);
    expect(await opacidad(page, CUANTAS - 1)).toBe(0);

    // Pasado: entero, también la última estrella.
    await bajarHasta(page, -0.5);
    await expect(trazado).toHaveAttribute("data-trazado", "entero");
    await expect.poll(() => opacidad(page, CUANTAS - 1)).toBeGreaterThan(0);

    // Y al volver arriba no se borra.
    await bajarHasta(page, 2);
    await expect(trazado).toHaveAttribute("data-trazado", "entero");
    expect(await opacidad(page, CUANTAS - 1)).toBeGreaterThan(0);
  });

  /**
   * SIN FOTO DE PORTADA EL RETRATO YA SE VE AL LLEGAR: asoma bajo la portada.
   * Atado al scroll se quedaba a medio trazar, como algo que no ha terminado
   * de cargar. Ahora se traza solo, entero, sin que nadie baje.
   */
  test("si al llegar ya se ve, se dibuja entero sin bajar", async ({ page }) => {
    const fotos = await conBase(
      (sql) => sql<{ id: string }[]>`
        update public.medios set publicado = false
         where seccion = 'portada' and publicado
     returning id
      `,
    );
    try {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expect(retrato(page)).toBeInViewport();

      const trazado = retrato(page).locator("[data-trazado]");
      await expect(trazado).not.toHaveAttribute("data-al-bajar");
      const seDibujaSolo = await trazado.evaluate((nodo) =>
        nodo.getAnimations().some((animacion) => {
          return (animacion as CSSAnimation).animationName === "trazar-retrato";
        }),
      );
      expect(seDibujaSolo).toBe(true);

      await expect(trazado).toHaveAttribute("data-trazado", "entero", { timeout: 10_000 });
      await expect.poll(() => opacidad(page, CUANTAS - 1)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      if (fotos.length > 0) {
        await conBase(
          (sql) =>
            sql`update public.medios set publicado = true where id in ${sql(fotos.map((f) => f.id))}`,
        );
      }
    }
  });

  test("con movimiento reducido está entero desde el principio y no titila", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await bajarHasta(page, 2);

    await expect(retrato(page).locator("[data-trazado]")).toHaveAttribute(
      "data-trazado",
      "entero",
    );
    expect(await opacidad(page, CUANTAS - 1)).toBeGreaterThan(0);
    const titileo = await retrato(page)
      .locator(".titila-en-el-retrato")
      .first()
      .evaluate((nodo) => getComputedStyle(nodo).animationName);
    expect(titileo).toBe("none");
  });

  test("sin JavaScript, el retrato sale entero", async ({ browser }) => {
    const contexto = await browser.newContext({ javaScriptEnabled: false });
    const pagina = await contexto.newPage();
    await pagina.goto("/");
    await expect(estrellas(pagina)).toHaveCount(CUANTAS);
    expect(await opacidad(pagina, CUANTAS - 1)).toBeGreaterThan(0);
    await contexto.close();
  });

  // CASOS DE ERROR: lo que no se debe ver, no se ve, y la noche sigue.
  test("con su sección apagada en el panel, no hay retrato", async ({ page }) => {
    await conSeccionApagada("retrato", async () => {
      await page.goto("/");
      await expect(retrato(page)).toHaveCount(0);
      await expect(page.locator('[data-tramo="noche"]')).toHaveCount(1);
    });
  });

  test("una foto del retrato sin publicar no se dibuja", async ({ page }) => {
    await ponerRetrato(false);
    await page.goto("/");
    // Ésta no: si la base tiene otro retrato publicado, el que sale es ése.
    await expect(page.locator(`[data-retrato][aria-label="${ALTERNATIVO}"]`)).toHaveCount(0);
  });
});
