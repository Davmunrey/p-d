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
 * El Save the Date lleva la Lira dos veces, y las dos son de la entrega: impresa
 * en la solapa del sobre, boca abajo y como filigrana, y dentro de la tarjeta
 * con las estrellas al 120 %. Se abre en un móvil, desde WhatsApp, así que
 * estas pruebas fijan ese alto.
 */
test.describe("La constelación del Save the Date", () => {
  const MOVIL = { width: 390, height: 844 };

  test("Lira va impresa en la solapa y dentro de la tarjeta", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    // Las dos constelaciones; el icono del calendario del pie no cuenta.
    const dibujos = page.locator(".solapa svg, .naipe-tarjeta svg");
    await expect(dibujos).toHaveCount(2);

    for (const dibujo of [dibujos.nth(0), dibujos.nth(1)]) {
      expect(await dibujo.locator("circle").count()).toBeGreaterThanOrEqual(4);
    }

    // Y la de la tarjeta brilla más: sus estrellas van a escala 1,2 (BODA-122).
    const enSolapa = await page.locator(".solapa svg circle").first().getAttribute("r");
    const enTarjeta = await page.locator(".naipe-tarjeta svg circle").first().getAttribute("r");
    expect(Number(enTarjeta)).toBeCloseTo(Number(enSolapa) * 1.2, 5);
  });

  /**
   * CASO DE ERROR / ACCESIBILIDAD. Aquí la constelación es adorno sobre unos
   * nombres. Si se anunciara, quien navega con lector de pantalla oiría «Lira»
   * antes que a los novios, que es lo único que la página tiene que decir.
   */
  test("como adorno, no le dice nada a un lector de pantalla", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    const dibujos = page.locator(".solapa svg, .naipe-tarjeta svg");
    await expect(dibujos).toHaveCount(2);
    for (const dibujo of [dibujos.nth(0), dibujos.nth(1)]) {
      await expect(dibujo).toHaveAttribute("aria-hidden", "true");
      await expect(dibujo.locator("title")).toHaveCount(0);
    }
  });

  /**
   * CASO DE ERROR. Con el sobre cerrado sólo se ve la de la solapa; la de la
   * tarjeta espera dentro, sin pintarse, hasta que se toca el sello.
   */
  test("cerrada, se ve la de la solapa; abierta, la de la tarjeta", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    await expect(page.locator(".solapa svg")).toBeVisible();
    await expect(page.locator(".naipe-tarjeta")).toHaveCSS("opacity", "0");

    await expect(page.locator(".pieza-sobre")).toHaveAttribute("data-hidratado", "");
    await page.getByRole("button", { name: copy.saveTheDate.abrir }).click();
    await expect(page.locator(".pieza-sobre")).toHaveAttribute("data-fuera", "");
    await expect(page.locator(".naipe-tarjeta")).toHaveCSS("opacity", "1");
    await expect(page.locator(".naipe-tarjeta svg")).toBeVisible();
  });
});

/**
 * BODA-122 · El svg no recorta.
 *
 * Con `escala` una estrella pegada al borde crece hacia fuera del lienzo de
 * 100 × 100. El componente de la entrega lleva `overflow: visible` por eso;
 * el del repo computaba `hidden` y el día que entrase la escala la cortaría.
 */
test.describe("El lienzo de una constelación", () => {
  test("desborda a la vista, como el de la entrega", async ({ page }) => {
    await page.goto("/cocina");

    const desbordes = await page.evaluate(() =>
      [...document.querySelectorAll("svg[role='img']")].map(
        (svg) => getComputedStyle(svg).overflow,
      ),
    );

    expect(desbordes.length).toBeGreaterThan(0);
    expect(new Set(desbordes)).toEqual(new Set(["visible"]));
  });
});
