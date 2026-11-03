import { expect, test } from "./utiles/origen-propio";

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
 * EL SAVE THE DATE YA NO LLEVA LA LIRA. La llevaba dos veces —en la solapa y
 * en la tarjeta— y los novios la cambiaron por su retrato de estrellas, que
 * prueba `reserva-la-fecha.spec.ts` con un retrato de verdad en la base. Aquí
 * se vigila lo contrario: que la constelación no vuelve por la puerta de
 * atrás, ni con el sobre cerrado ni abierto. Se abre en un móvil, desde
 * WhatsApp, así que estas pruebas fijan ese alto.
 */
test.describe("La constelación del Save the Date", () => {
  const MOVIL = { width: 390, height: 844 };

  test("no hay Lira ni en la solapa ni en la tarjeta, cerrado ni abierto", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    // Una constelación se reconoce por sus trazos: el retrato son sólo estrellas
    // y el icono del calendario, un rectángulo y un trazado.
    const trazos = page.locator(".pieza-sobre svg line");
    await expect(page.locator(".pieza-sobre")).toHaveAttribute("data-hidratado", "");
    await expect(trazos).toHaveCount(0);

    await page.getByRole("button", { name: copy.saveTheDate.abrir }).click();
    await expect(page.locator(".pieza-sobre")).toHaveAttribute("data-fuera", "");
    await expect(page.locator(".naipe-tarjeta")).toHaveCSS("opacity", "1");
    await expect(trazos).toHaveCount(0);
  });

  /**
   * CASO DE ERROR / ACCESIBILIDAD. Si la Lira volviera como imagen con nombre,
   * quien navega con lector de pantalla oiría «Lira» antes que a los novios.
   */
  test("nada en el sobre se anuncia como la Lira", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/reserva-la-fecha");

    await expect(page.getByRole("img", { name: /lira/i })).toHaveCount(0);
    await expect(page.locator(".pieza-sobre svg title")).toHaveCount(0);
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
