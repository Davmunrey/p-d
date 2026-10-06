import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { MENUS_RSVP } from "../../src/config/constants";
import { TOKENS_DURACION } from "../../src/config/tokens";
import { PALETAS } from "../../src/config/tokens.generado";
import { transicionLegible } from "../../src/lib/valor-css";

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

/**
 * BODA-124 · LA COCINA ENSEÑA LO QUE DICE EL SISTEMA DE MARCA
 *
 * El catálogo vivo existía, pero enseñaba menos de lo que dice el de la
 * entrega y, en tipografía, enseñaba mal: todas las muestras de la escala
 * salían en la serif romana y en tinta, fuera Jost, cita o conector. Los
 * colores no decían su valor y faltaban veinte. Aquí se mide lo que se pinta.
 */
test.describe("El catálogo del sistema de marca", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cocina");
  });

  /** Familia, peso, estilo y color de la letra que pinta la muestra de un token. */
  async function comoSePinta(page: Page, token: string) {
    return page.locator(`[data-muestra-de="${token}"] > div:last-child`).evaluate((caja) => {
      let nodo = caja.firstElementChild!;
      const textoPropio = (n: Element) =>
        [...n.childNodes].some((h) => h.nodeType === Node.TEXT_NODE && h.textContent?.trim());
      while (nodo.children.length === 1 && !textoPropio(nodo)) nodo = nodo.firstElementChild!;
      const estilo = getComputedStyle(nodo);
      return {
        familia: estilo.fontFamily,
        peso: estilo.fontWeight,
        estilo: estilo.fontStyle,
        color: estilo.color,
      };
    });
  }

  /** El `rgb()` que computa un token de color. */
  async function colorDe(page: Page, token: string) {
    return page.evaluate((nombre) => {
      const sonda = document.createElement("span");
      sonda.style.color = `var(${nombre})`;
      document.body.appendChild(sonda);
      const valor = getComputedStyle(sonda).color;
      sonda.remove();
      return valor;
    }, `--${token}`);
  }

  test("la cabecera dice «Sistema de marca» y la navegación lleva a cada sección", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.cocina.titulo);
    for (const principio of Object.values(copy.cocina.principios)) {
      await expect(page.getByText(principio.texto)).toBeVisible();
    }

    const navegacion = page.getByRole("navigation", { name: copy.cocina.navegacion });
    const enlaces = navegacion.getByRole("link");
    expect(await enlaces.count()).toBeGreaterThan(0);

    for (const enlace of await enlaces.all()) {
      const ancla = await enlace.getAttribute("href");
      const seccion = page.locator(`section${ancla}`);
      await expect(
        seccion,
        `«${await enlace.innerText()}» no lleva a ninguna sección`,
      ).toHaveCount(1);
      // El enlace se llama como la sección a la que lleva.
      await expect(seccion.getByRole("heading", { level: 2 })).toHaveText(
        (await enlace.innerText()).trim(),
        { ignoreCase: true },
      );
    }

    await navegacion.getByRole("link", { name: copy.cocina.seccionMovimiento }).click();
    await expect(page).toHaveURL(/#movimiento$/);
    await expect(page.locator("section#movimiento h2")).toBeInViewport();
  });

  test("cada muestra de la escala se pinta con su familia, su peso y su color", async ({
    page,
  }) => {
    const { titulo, cuerpo, conector } = copy.cocina.familias;

    const textoCuerpo = await comoSePinta(page, "texto-cuerpo");
    expect(textoCuerpo.familia).toContain(cuerpo.nombre);
    expect(textoCuerpo.peso).toBe("400");

    const cita = await comoSePinta(page, "texto-cita");
    expect(cita.familia).toContain(titulo.nombre);
    expect(cita.estilo).toBe("italic");
    expect(cita.peso).toBe("300");
    expect(cita.color).toBe(await colorDe(page, "acento"));

    const y = await comoSePinta(page, "texto-conector");
    expect(y.familia).toContain(conector.nombre);
    expect(y.color).toBe(await colorDe(page, "acento"));

    // Y la ficha de al lado lo dice: familia por su nombre de la entrega y peso.
    await expect(page.locator('[data-muestra-de="texto-cuerpo"]')).toContainText(
      `${cuerpo.nombre} · 400`,
    );
    await expect(page.locator('[data-muestra-de="texto-cita"]')).toContainText(
      `${titulo.nombre} · 300 · ${copy.cocina.cursiva}`,
    );
  });

  test("las tres familias tienen su ficha y su nombre es el de la letra que se carga", async ({
    page,
  }) => {
    for (const [id, familia] of Object.entries(copy.cocina.familias)) {
      const ficha = page.locator(`[data-familia="${id}"]`);
      await expect(ficha).toContainText(familia.nombre);
      await expect(ficha).toContainText(familia.uso);

      // Si alguien cambia la fuente y no el copy, la ficha mentiría.
      const pila = await page.evaluate(
        (token) => getComputedStyle(document.documentElement).getPropertyValue(token),
        `--fuente-${id}`,
      );
      expect(pila, `--fuente-${id} ya no es ${familia.nombre}`).toContain(familia.nombre);
    }
  });

  /**
   * EL CATÁLOGO NO PUEDE QUEDARSE CORTO. Se leen del propio `semantic.css` los
   * colores de la capa semántica —por otro camino que el generador— y cada uno
   * tiene que tener su ficha con su valor. Un color nuevo en el CSS sin ficha
   * pone este test en rojo.
   */
  test("hay una ficha por cada color de semantic.css, con su valor resuelto", async ({
    page,
  }) => {
    const css = readFileSync(
      join(__dirname, "../../src/styles/tokens/semantic.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const raiz = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
    const colores = [...raiz.matchAll(/--([\w-]+)\s*:\s*var\(--color-[\w-]+\)/g)].map(
      ([, token]) => token!,
    );
    expect(colores.length).toBeGreaterThan(40);

    // Los valores los escribe el navegador al hidratar: se espera al último.
    await expect(page.locator("[data-ficha-color] [data-valor-de]").last()).not.toBeEmpty();
    const fichas = await page
      .locator("[data-ficha-color]")
      .evaluateAll((nodos) =>
        Object.fromEntries(
          nodos.map((nodo) => [
            nodo.getAttribute("data-ficha-color"),
            nodo.querySelector("[data-valor-de]")?.textContent ?? "",
          ]),
        ),
      );

    for (const token of colores) {
      expect(fichas[token], `--${token} no tiene ficha en /cocina`).toBeDefined();
      expect(fichas[token], `la ficha de --${token} no dice su valor`).toMatch(
        /^#[0-9A-F]{6}( · \d+\s%)?$/,
      );
    }

    // Y el valor que dice es el del CSS, no uno aproximado.
    expect(fichas["fondo"]).toBe(PALETAS.claro.fondo.toUpperCase());
    expect(fichas["acento"]).toBe(PALETAS.claro.acento.toUpperCase());
  });

  test("los campos traen el desplegable de menú de la entrega", async ({ page }) => {
    const menu = page
      .locator('[data-prueba="componente-campos"]')
      .getByLabel(copy.rsvp.menuEtiqueta, { exact: true });
    await expect(menu).toHaveJSProperty("tagName", "SELECT");
    await expect(menu.locator("option")).toHaveCount(MENUS_RSVP.length);
  });

  /**
   * CASO DE ERROR · con «reducir movimiento», la hoja de estilos acorta TODA
   * transición de la página al mínimo. Si la tabla midiera las duraciones con
   * una sonda, diría que todo dura lo mismo justo a quien más le importa saber
   * qué se mueve. Tiene que seguir leyendo el token.
   */
  test("con movimiento reducido, la tabla sigue diciendo lo que dura cada transición", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/cocina");

    const tabla = page.locator('[data-prueba="componente-duraciones"]');
    await expect(tabla.locator("dd").last()).not.toBeEmpty();
    const leidas = await tabla.locator("dd").allInnerTexts();
    expect(leidas).toHaveLength(TOKENS_DURACION.length);
    expect(new Set(leidas).size, "todas las duraciones dicen lo mismo").toBe(leidas.length);

    const crudo = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--transicion-aparicion"),
    );
    expect(leidas[TOKENS_DURACION.indexOf("transicion-aparicion")]).toBe(
      transicionLegible(crudo).duracion,
    );
  });
});
