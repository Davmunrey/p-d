import { expect, test, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO } from "../../src/config/constants";

/**
 * AUDITORÍA DE DISEÑO (hallmark, taste, ui-ux-pro-max e impeccable) · LO QUE
 * TOCA EL INVITADO FUERA DE LA PORTADA
 *
 * Cada bloque es un hallazgo de la auditoría que se arregló, con lo que se
 * midió entonces convertido en la afirmación que lo sostiene.
 */

function luminancia([r, g, b]: number[]) {
  const [R, G, B] = [r!, g!, b!].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
}
const rgb = (valor: string) => (valor.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
const contraste = (a: string, b: string) => {
  const [claro, oscuro] = [luminancia(rgb(a)), luminancia(rgb(b))].sort((x, y) => y - x);
  return (claro! + 0.05) / (oscuro! + 0.05);
};

/** El color de fondo que de verdad tiene detrás un elemento. */
function fondoDe(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((nodo) => {
      let actual: Element | null = nodo;
      while (actual) {
        const fondo = getComputedStyle(actual).backgroundColor;
        if (fondo !== "rgba(0, 0, 0, 0)" && fondo !== "transparent") return fondo;
        actual = actual.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    });
}

test.describe("El Save the Date", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: "reduce" },
  });

  /*
    Se intenta desplazar el <main> por dentro. Con `overflow-x-hidden`, el eje
    vertical pasaba a `auto` y el cielo, que sobresale 2,5 rem, le daba 40 px de
    recorrido: el sobre subía con la rueda y en Windows salía una segunda barra.
    Con `overflow: clip` el <main> no es un contenedor con desplazamiento.
  */
  const intentarDesplazar = (page: Page) =>
    page.locator("main").evaluate((main) => {
      main.scrollTop = 100;
      return { desplazado: main.scrollTop, desbordeY: getComputedStyle(main).overflowY };
    });

  test("el <main> no tiene desplazamiento propio, ni cerrado ni abierto", async ({ page }) => {
    await page.goto("/reserva-la-fecha");
    let medida = await intentarDesplazar(page);
    expect(medida.desbordeY).not.toBe("auto");
    expect(medida.desplazado).toBe(0);

    await page.goto("/reserva-la-fecha?abierto");
    medida = await intentarDesplazar(page);
    expect(medida.desplazado).toBe(0);
  });

  test("el pie se pliega del todo y se despliega con la rejilla, no con max-height", async ({
    page,
  }) => {
    await page.goto("/reserva-la-fecha");
    const pie = page.locator(".pie-sobre");
    expect((await pie.boundingBox())!.height).toBeLessThan(1);
    const transicion = await pie.evaluate((nodo) => getComputedStyle(nodo).transitionProperty);
    expect(transicion).toContain("grid-template-rows");
    expect(transicion).not.toContain("max-height");

    await page.goto("/reserva-la-fecha?abierto");
    await expect(page.getByRole("link", { name: copy.saveTheDate.verLaWeb })).toBeVisible();
    expect((await pie.boundingBox())!.height).toBeGreaterThan(0);
  });

  test("«Tocad el sello para abrir» se lee: AA sobre su fondo", async ({ page }) => {
    await page.goto("/reserva-la-fecha");
    const pista = page.getByText(copy.saveTheDate.pista);
    const tinta = await pista.evaluate((nodo) => getComputedStyle(nodo).color);
    expect(contraste(tinta, await fondoDe(page, ".pista-sobre"))).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("Las pantallas de estado", () => {
  test("la 404 lleva la Lira y el bloque arriba, no flotando en medio", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/una-ruta-que-no-existe-para-la-auditoria");

    const main = page.getByRole("main");
    await expect(main.locator("svg").first()).toBeVisible();
    const titulo = page.getByRole("heading", { level: 1 });
    await expect(titulo).toHaveText(copy.errores.noEncontrado);
    expect((await titulo.boundingBox())!.y).toBeLessThan(844 * 0.45);
  });
});

test.describe("La puerta del panel", () => {
  test("«He olvidado la contraseña» parece un enlace y se puede tocar", async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    const enlace = page.getByRole("link", { name: copy.acceso.olvidada });
    const caja = (await enlace.boundingBox())!;
    expect(caja.height).toBeGreaterThanOrEqual(24);
    const borde = await enlace.evaluate((nodo) => getComputedStyle(nodo).borderBottomWidth);
    expect(parseFloat(borde)).toBeGreaterThan(0);
  });
});

test.describe("Los campos", () => {
  test("con error, el error ocupa el sitio de la ayuda y es lo que se anuncia", async ({
    page,
  }) => {
    await page.goto("/cocina");
    const error = page.getByText(copy.errores.emailInvalido);
    await expect(error).toBeVisible();
    // La ayuda de ese mismo campo ya no sale a la vez.
    await expect(page.getByText(copy.rsvp.contactoAyuda)).toHaveCount(0);

    const id = await error.getAttribute("id");
    const campo = page.locator(`[aria-describedby="${id}"]`);
    await expect(campo).toHaveCount(1);
    await expect(campo).toHaveAttribute("aria-invalid", "true");
  });
});
