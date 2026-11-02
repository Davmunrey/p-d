import { expect, test, type Locator, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";

/**
 * LA LANDING ES UN DÍA ENTERO: DE NOCHE A NOCHE
 *
 * La portada es un firmamento completo; al bajar amanece para la historia,
 * pasa la tarde con la logística y cae al ocaso, y el final vuelve a ser de
 * noche con «sólo falta vuestra estrella». En la historia, cada hito enciende
 * una estrella de un camino que cruza el cielo, sin formar ninguna figura.
 *
 * Todo lo mueven `IntersectionObserver` y transiciones de CSS, así que se
 * prueba igual en Chrome y en Safari: leyendo atributos que pone el código y
 * lo que el navegador tiene pintado. Cada gesto con su caso de error: sin
 * movimiento, la noche está quieta, las horas no se pintan y la historia está
 * entera desde el principio.
 */

const ESCRITORIO = { width: 1440, height: 900 };

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

/** Cuántos píxeles tiene pintados un lienzo (con algo de luz, no transparentes). */
async function pixelesPintados(lienzo: Locator): Promise<number> {
  return lienzo.evaluate((nodo) => {
    const canvas = nodo as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let pintados = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) pintados += 1;
    return pintados;
  });
}

const opacidad = (elemento: Locator) =>
  elemento.evaluate((nodo) => parseFloat(getComputedStyle(nodo).opacity));

test.describe("La portada es de noche", () => {
  test("un firmamento entero que se enciende, decorativo para quien no ve", async ({
    page,
  }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const portada = page.locator("#portada");
    await expect(portada).toHaveAttribute("data-seccion", "inversa");
    const cielo = portada.locator("[data-cielo-estrellado]");
    await expect(cielo).toHaveAttribute("aria-hidden", "true");
    await expect(cielo).toHaveAttribute("data-cielo", "vivo");
    // Cientos de estrellas a 1440×900, y pintadas de verdad en el lienzo.
    expect(Number(await cielo.getAttribute("data-estrellas"))).toBeGreaterThan(300);
    await expect.poll(() => pixelesPintados(cielo)).toBeGreaterThan(1000);
  });

  test("y lo que no se ve no se pinta: el cielo del final espera parado", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#rsvp [data-cielo-estrellado]")).toHaveAttribute(
      "data-cielo",
      "pausado",
    );
  });

  /** CASO DE ERROR · con movimiento reducido la noche está, pero quieta. */
  test("con movimiento reducido el cielo se pinta una vez y no se mueve", async ({ page }) => {
    await conMovimientoReducido(page);
    const cielo = page.locator("#portada [data-cielo-estrellado]");
    await expect(cielo).toHaveAttribute("data-cielo", "quieto");
    expect(await pixelesPintados(cielo)).toBeGreaterThan(1000);
  });

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
    expect(estado.map((e) => e.retardo)).toEqual([0.35, 0.5]);
    for (const e of estado) expect(e.recorte, "la máscara recorta").toContain("inset(");
  });

  /** CASO DE ERROR · con movimiento reducido los nombres ya están. */
  test("con movimiento reducido los nombres no emergen", async ({ page }) => {
    await conMovimientoReducido(page);
    const nombres = await page
      .locator("#portada .linea-que-emerge")
      .evaluateAll((nodos) => nodos.map((nodo) => getComputedStyle(nodo).animationName));
    expect(new Set(nombres)).toEqual(new Set(["aparecer"]));
  });
});

test.describe("La cabecera pasa por la noche", () => {
  test("sobre la noche es inversa, y sobre el día vuelve a ser clara", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    const cabecera = page.locator("header").first();

    await expect(cabecera).toHaveAttribute("data-seccion", "inversa");

    await ponerA(page, page.locator("#programa"), 0);
    await expect(cabecera).not.toHaveAttribute("data-seccion", "inversa");

    // Y otra vez de noche al llegar al final.
    await ponerA(page, page.locator("#rsvp"), -0.2);
    await expect(cabecera).toHaveAttribute("data-seccion", "inversa");
  });
});

test.describe("El cielo del día", () => {
  const cielo = (page: Page) => page.locator("[data-cielo-del-dia]");

  test("cada sección pone su hora, y el tinte de esa hora se enciende", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    await expect(cielo(page)).toHaveAttribute("aria-hidden", "true");
    await expect(cielo(page)).toHaveAttribute("data-fase", "noche");

    for (const [seccion, fase, capa] of [
      ["#historia", "alba", "alba"],
      ["#programa", "tarde", "tarde"],
      ["#playlist", "ocaso", "ocaso"],
    ] as const) {
      await ponerA(page, page.locator(seccion), 0.3);
      await expect(cielo(page), seccion).toHaveAttribute("data-fase", fase);
      await expect
        .poll(() => opacidad(cielo(page).locator(`.cielo-${capa}`)), { message: capa })
        .toBeGreaterThan(0.95);
    }

    await ponerA(page, page.locator("#rsvp"), 0.3);
    await expect(cielo(page)).toHaveAttribute("data-fase", "noche");
  });

  /** CASO DE ERROR · sin movimiento no hay horas que se funden: la página de siempre. */
  test("con movimiento reducido no se pinta ninguna hora", async ({ page }) => {
    await conMovimientoReducido(page);
    expect(await cielo(page).evaluate((n) => getComputedStyle(n).visibility)).toBe("hidden");
  });
});

test.describe("Nuestra historia enciende su camino", () => {
  const estrellas = (page: Page) => page.locator("#historia .estrella-del-camino");
  const hitos = (page: Page) => page.locator("#historia ol > li");

  test("cada hito enciende su estrella, y el último completa el camino", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    const cuantos = await hitos(page).count();
    test.skip(cuantos === 0, "La base no tiene hitos publicados");

    // Una estrella por hito, sin figura de más.
    await expect(estrellas(page)).toHaveCount(cuantos);
    await expect(page.locator("#historia [data-escena]")).toHaveAttribute(
      "data-escena",
      "viva",
    );

    await ponerA(page, hitos(page).first(), 0.3);
    await expect(estrellas(page).first()).toHaveAttribute("data-encendida", "");
    if (cuantos > 1) {
      await expect(estrellas(page).last()).not.toHaveAttribute("data-encendida", "");
      await expect(page.locator("#historia .cierre-historia")).not.toHaveAttribute(
        "data-encendida",
        "",
      );
    }

    await ponerA(page, hitos(page).last(), 0.3);
    for (const estrella of await estrellas(page).all()) {
      await expect(estrella).toHaveAttribute("data-encendida", "");
    }
    await expect.poll(() => opacidad(estrellas(page).last())).toBeGreaterThan(0.95);
    await expect(page.locator("#historia").getByText(copy.historia.cierre)).toBeVisible();
    await expect
      .poll(() => opacidad(page.locator("#historia .cierre-historia")))
      .toBeGreaterThan(0.95);
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

  /** CASO DE ERROR · con movimiento reducido el camino está entero desde el principio. */
  test("con movimiento reducido todo está encendido", async ({ page }) => {
    await conMovimientoReducido(page);
    test.skip((await hitos(page).count()) === 0, "La base no tiene hitos publicados");
    await expect(page.locator("#historia [data-escena]")).toHaveCount(0);
    const encendidas = await estrellas(page).evaluateAll((nodos) =>
      nodos.map((nodo) => parseFloat(getComputedStyle(nodo).opacity)),
    );
    expect(new Set(encendidas)).toEqual(new Set([1]));
  });

  /** CASO DE ERROR · sin JavaScript no falta nada que leer. */
  test("sin JavaScript la historia está entera", async ({ browser }) => {
    const contexto = await browser.newContext({ javaScriptEnabled: false });
    const pagina = await contexto.newPage();
    await pagina.goto("/");
    const cuantos = await hitos(pagina).count();
    test.skip(cuantos === 0, "La base no tiene hitos publicados");
    const encendidas = await estrellas(pagina).evaluateAll((nodos) =>
      nodos.map((nodo) => parseFloat(getComputedStyle(nodo).opacity)),
    );
    expect(new Set(encendidas)).toEqual(new Set([1]));
    await expect(pagina.locator("#historia").getByText(copy.historia.cierre)).toBeVisible();
    await contexto.close();
  });
});

test.describe("La noche del final", () => {
  test("todo el cielo vuelve, y entre las estrellas late la vuestra", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");
    const final = page.locator("#rsvp");
    test.skip((await final.count()) === 0, "La sección está apagada en la base");

    await ponerA(page, final, 0.1);
    await expect(final.locator("[data-cielo-estrellado]")).toHaveAttribute(
      "data-cielo",
      "vivo",
    );
    await expect(final.getByText(copy.rsvp.faltaVuestraEstrella)).toBeVisible();
    const vuestra = final.locator('svg[data-vuestra-estrella="falta"]');
    await expect(vuestra).toHaveAttribute("aria-hidden", "true");
    expect(
      await vuestra
        .locator(".latido-estrella")
        .evaluate((n) => getComputedStyle(n).animationName),
      "vuestra estrella late",
    ).toBe("latir-estrella");
  });

  /** CASO DE ERROR · con movimiento reducido vuestra estrella no late. */
  test("con movimiento reducido vuestra estrella está, pero no late", async ({ page }) => {
    await conMovimientoReducido(page);
    const final = page.locator("#rsvp");
    test.skip((await final.count()) === 0, "La sección está apagada en la base");
    expect(
      await final
        .locator(".latido-estrella")
        .evaluate((n) => getComputedStyle(n).animationName),
    ).toBe("none");
  });
});
