import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * BODA-34 · Las constelaciones
 *
 * El único elemento ilustrativo del sistema de marca. Lo que se comprueba aquí
 * es lo que de verdad puede romperse: que se dibujan, que cambian de color
 * solas al cambiar el fondo —sin tocar una clase— y que no le cuentan nada a
 * quien escucha la página cuando son adorno.
 */

test.describe("El catálogo del sistema de marca", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cocina");
  });

  test("se dibujan las dieciséis, repartidas por hemisferio", async ({ page }) => {
    const catalogo = page.locator("section", {
      has: page.getByRole("heading", { name: copy.cocina.seccionConstelaciones }),
    });

    await expect(catalogo.locator("svg[role='img']")).toHaveCount(16);
    await expect(catalogo.getByText(copy.cocina.hemisferioNorte)).toBeVisible();
    await expect(catalogo.getByText(copy.cocina.hemisferioSur)).toBeVisible();
  });

  test("cada mapa tiene sus estrellas y sus líneas, no un hueco", async ({ page }) => {
    // Un SVG vacío ocupa el mismo sitio que uno dibujado: sin contar los
    // elementos de dentro, este test pasaría con dieciséis cuadros en blanco.
    const dibujos = await page.evaluate(() =>
      [...document.querySelectorAll("svg[role='img']")].map((svg) => ({
        nombre: svg.querySelector("title")?.textContent ?? "",
        estrellas: svg.querySelectorAll("circle").length,
        lineas: svg.querySelectorAll("line").length,
      })),
    );

    expect(dibujos).toHaveLength(16);
    for (const dibujo of dibujos) {
      expect(dibujo.nombre.length, "una constelación sin nombre").toBeGreaterThan(0);
      expect(dibujo.estrellas, `${dibujo.nombre} sin estrellas`).toBeGreaterThanOrEqual(4);
      expect(dibujo.lineas, `${dibujo.nombre} sin líneas`).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * La promesa del sistema, comprobada donde se puede comprobar: la misma
   * constelación, sin una sola clase distinta, cambia de color al meterla en un
   * bloque inverso. Si esto falla, el color se ha colado en el componente.
   */
  test("el mismo dibujo se aclara solo dentro de un bloque inverso", async ({ page }) => {
    const colores = await page.evaluate(() => {
      const original = document.querySelector("svg[role='img']")!;
      const claro = {
        estrella: getComputedStyle(original.querySelector("circle")!).fill,
        trazo: getComputedStyle(original.querySelector("line")!).stroke,
      };

      // El mismo nodo, clonado dentro de un bloque inverso. Ni una clase cambia.
      const bloque = document.createElement("div");
      bloque.setAttribute("data-seccion", "inversa");
      const copia = original.cloneNode(true) as SVGElement;
      bloque.append(copia);
      document.body.append(bloque);

      const inverso = {
        estrella: getComputedStyle(copia.querySelector("circle")!).fill,
        trazo: getComputedStyle(copia.querySelector("line")!).stroke,
      };
      bloque.remove();

      return { claro, inverso, clases: original.getAttribute("class") };
    });

    expect(colores.claro.estrella).not.toBe(colores.inverso.estrella);
    expect(colores.claro.trazo).not.toBe(colores.inverso.trazo);

    // Y ninguno de los dos es transparente: un token que no resuelve pinta
    // `rgba(0, 0, 0, 0)` y el dibujo desaparecería sin dar ningún error.
    for (const color of Object.values({ ...colores.claro, ...colores.inverso })) {
      expect(color).not.toContain("rgba(0, 0, 0, 0)");
    }
  });
});

/**
 * El Save the Date se abre en un móvil, desde WhatsApp. Por eso estas pruebas
 * fijan el alto en vez de heredar el del proyecto: lo que se comprueba aquí
 * depende de cuánta pantalla hay, no de cuál es el navegador.
 */
test.describe("La constelación del Save the Date", () => {
  const MOVIL = { width: 390, height: 844 };
  const VENTANA_BAJA = { width: 1280, height: 720 };

  test("Lira abre la página en un móvil de hoy", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    const dibujo = page.locator("main svg").first();
    await expect(dibujo).toBeVisible();
    expect(await dibujo.locator("circle").count()).toBeGreaterThanOrEqual(4);
  });

  /**
   * CASO DE ERROR / ACCESIBILIDAD. Aquí la constelación es adorno sobre unos
   * nombres. Si se anunciara, quien navega con lector de pantalla oiría «Lira»
   * antes que a los novios, que es lo único que la página tiene que decir.
   */
  test("como adorno, no le dice nada a un lector de pantalla", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    const dibujo = page.locator("main svg").first();
    await expect(dibujo).toHaveAttribute("aria-hidden", "true");
    await expect(dibujo.locator("title")).toHaveCount(0);
  });

  /**
   * CASO DE ERROR. La página promete caber de una vez, y un adorno no puede
   * romper esa promesa. En una ventana baja la constelación se retira sola.
   */
  test("en una pantalla baja el adorno se retira y la página sigue cabiendo", async ({
    page,
  }) => {
    await page.setViewportSize(VENTANA_BAJA);
    await page.goto("/reserva-la-fecha");

    await expect(page.locator("main svg").first()).toBeHidden();

    const medidas = await page.evaluate(() => ({
      alto: document.documentElement.scrollHeight,
      ventana: window.innerHeight,
    }));
    expect(medidas.alto).toBeLessThanOrEqual(medidas.ventana + 1);
  });

  test("y donde sí cabe, sigue cabiendo con la constelación puesta", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    const medidas = await page.evaluate(() => ({
      alto: document.documentElement.scrollHeight,
      ventana: window.innerHeight,
      adorno: document.querySelector("main svg")!.getBoundingClientRect().height,
    }));

    expect(medidas.adorno).toBeGreaterThan(0);
    expect(medidas.alto).toBeLessThanOrEqual(medidas.ventana + 1);
  });
});
