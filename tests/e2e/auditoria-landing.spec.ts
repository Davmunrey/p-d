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

test.describe("el degradado del final de la tira", () => {
  const tira = (page: import("@playwright/test").Page) => menu(page).locator("ul");
  const degradado = (page: import("@playwright/test").Page) =>
    menu(page).locator(".desvanecer-final");

  test("no vela la última sección cuando la tira cabe entera", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const cabe = await tira(page).evaluate((ul) => ul.scrollWidth <= ul.clientWidth + 1);
    test.skip(!cabe, "Con tantas secciones que no caben ni en escritorio, el degradado toca.");

    await expect(degradado(page)).toHaveCount(0);
  });

  test("en el móvil avisa de que hay más, y deja de hacerlo al llegar al final", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const desborda = await tira(page).evaluate((ul) => ul.scrollWidth > ul.clientWidth + 1);
    test.skip(!desborda, "Con una sola sección la tira cabe hasta en el móvil.");

    await expect(degradado(page)).toHaveCount(1);
    await tira(page).evaluate((ul) => ul.scrollTo({ left: ul.scrollWidth }));
    await expect(degradado(page)).toHaveCount(0);
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
