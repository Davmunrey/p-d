import { expect, test } from "./utiles/origen-propio";

/**
 * AUDITORÍA DE DISEÑO · EL CATÁLOGO DE LA COCINA
 *
 * · En cualquier móvil la página se desplazaba en horizontal: la lista de
 *   espaciado ponía en fila un nombre de 16 rem, un hueco y una barra de hasta
 *   8 rem, y nada la dejaba partirse.
 * · La «versión secundaria» del monograma era blanca sobre gris claro, a
 *   1,13:1: se veía una caja vacía. La de la entrega son los nombres apilados en
 *   versalita, en la tinta de la marca.
 */

function contraste(a: [number, number, number], b: [number, number, number]) {
  const l = ([r, g, bl]: [number, number, number]) => {
    const [R, G, B] = [r, g, bl].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
  };
  const [claro, oscuro] = [l(a), l(b)].sort((x, y) => y - x);
  return (claro! + 0.05) / (oscuro! + 0.05);
}

const rgb = (valor: string) =>
  (valor.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number) as [number, number, number];

for (const ancho of [320, 390]) {
  test(`a ${ancho} px no se desplaza en horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 800 });
    await page.goto("/cocina");

    const { scroll, visible } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      visible: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(visible);
  });
}

test("la versión secundaria del monograma es la de la entrega, y se lee", async ({ page }) => {
  await page.goto("/cocina");
  const ficha = page.locator('[data-prueba="monograma-secundaria"]');
  test.skip((await ficha.count()) === 0, "Sin configuración de la boda no hay monograma.");

  const { tinta, fondo, texto } = await ficha.evaluate((nodo) => {
    const marca = nodo.querySelector('[aria-hidden="true"]') as HTMLElement;
    return {
      tinta: getComputedStyle(marca).color,
      fondo: getComputedStyle(nodo).backgroundColor,
      texto: marca.innerText,
    };
  });

  // Los nombres enteros, apilados en tres líneas con el nexo en medio.
  expect(texto.split("\n").filter(Boolean)).toHaveLength(3);
  expect(contraste(rgb(tinta), rgb(fondo))).toBeGreaterThanOrEqual(4.5);
});
