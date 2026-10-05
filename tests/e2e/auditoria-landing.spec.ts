import { expect, test } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";

/**
 * AUDITORÍA DE DISEÑO (hallmark, taste, ui-ux-pro-max e impeccable) · LA
 * PORTADA
 *
 * Cada bloque es un hallazgo que se arregló, con lo que se midió entonces
 * convertido en la afirmación que lo sostiene.
 */

const menu = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: copy.navegacion.etiquetaPrincipal });

test.describe("«Confirmar» en la barra", () => {
  test("en el móvil se ve entero sin deslizar la barra", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const confirmar = menu(page).getByRole("link", { name: copy.navegacion.secciones.rsvp });
    await expect(confirmar).toBeVisible();
    const caja = (await confirmar.boundingBox())!;
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(390);
  });

  test("no se deshace en el degradado del final de la tira", async ({ page }) => {
    await page.goto("/");
    const confirmar = menu(page).getByRole("link", { name: copy.navegacion.secciones.rsvp });
    // El degradado vive en el contenedor de la tira; el botón, fuera de él.
    await expect(
      confirmar.locator("xpath=ancestor::*[contains(@class,'desvanecer-final')]"),
    ).toHaveCount(0);
    // Y sigue siendo el último enlace del menú.
    const rotulos = (await menu(page).getByRole("link").allTextContents()).map((r) => r.trim());
    expect(rotulos.at(-1)).toBe(copy.navegacion.secciones.rsvp);
  });
});

test("las rutas de «Cómo llegar» alinean su texto, sea cual sea la duración", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const filas = page.locator("#transporte ul > li");
  test.skip((await filas.count()) < 2, "Hacen falta dos rutas para comparar.");

  const inicios = await filas.evaluateAll((lis) =>
    lis.map((li) => Math.round(li.children[1]!.getBoundingClientRect().left)),
  );
  expect(new Set(inicios).size).toBe(1);
});

test("el rombo de una versalita larga va con su primera palabra, no en el borde", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const rombo = page.locator("#regalos header span[aria-hidden]").first();
  test.skip(
    (await rombo.count()) === 0,
    "Sin la sección de regalos no hay versalita realzada.",
  );

  const margen = await page
    .locator("#regalos")
    .evaluate((seccion) => seccion.querySelector("header")!.getBoundingClientRect().left);
  const caja = (await rombo.boundingBox())!;
  // Centrada y partida en dos líneas, la primera empieza bastante más a la
  // derecha que el borde de la columna: el rombo tiene que ir con ella.
  expect(caja.x - margen).toBeGreaterThan(24);
});
