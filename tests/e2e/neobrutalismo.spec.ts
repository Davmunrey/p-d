import { expect, test, type Locator, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO } from "../../src/config/constants";

/**
 * LA WEB PÚBLICA ES NEOBRUTALISTA, CON LA MARCA
 *
 * La decisión fue: toda la web de los invitados —landing, RSVP, Save the Date
 * y pantallas de estado— dibuja sus piezas como bloques, con la paleta, las
 * familias y los motivos de siempre. Bloque quiere decir tres cosas medibles:
 * esquinas casi rectas, un contorno de tinta de dos píxeles y una sombra dura
 * (desplazada, SIN desenfoque). Y el panel, que comparte componentes, no lo
 * es: conserva sus radios, sus contornos de un píxel y sus sombras suaves.
 *
 * Se prueba el CSS calculado, no capturas: lo que importa es el contrato.
 */

/** Una sombra calculada, troceada: «rgb(…) 3px 3px 0px 0px» → sus números. */
interface Sombra {
  x: number;
  y: number;
  desenfoque: number;
  color: string;
}

async function sombraDe(elemento: Locator): Promise<Sombra | null> {
  return elemento.evaluate((nodo) => {
    const valor = getComputedStyle(nodo).boxShadow;
    if (valor === "none") return null;
    const color = valor.match(/rgba?\([^)]*\)/)?.[0] ?? "";
    const [x, y, desenfoque] = valor
      .replace(color, "")
      .trim()
      .split(/\s+/)
      .map((parte) => parseFloat(parte));
    return { x, y, desenfoque, color };
  });
}

/** El color que resuelve un semántico en el sitio de un elemento. */
async function tintaEn(elemento: Locator, token: string): Promise<string> {
  return elemento.evaluate((nodo, nombre) => {
    const sonda = document.createElement("span");
    sonda.style.color = `var(${nombre})`;
    nodo.appendChild(sonda);
    const color = getComputedStyle(sonda).color;
    sonda.remove();
    return color;
  }, `--${token}`);
}

/** Espera a que una pieza termine de entrar: la sombra se lee quieta. */
async function quieta(elemento: Locator) {
  await elemento.evaluate(async (nodo) => {
    const animaciones = nodo
      .getAnimations({ subtree: true })
      .filter(
        (a) =>
          a.timeline === document.timeline &&
          Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity),
      );
    await Promise.all(animaciones.map((a) => a.finished.catch(() => undefined)));
  });
}

async function alCentro(page: Page, elemento: Locator) {
  await elemento.evaluate((nodo) =>
    window.scrollTo({
      top: nodo.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3,
      behavior: "instant",
    }),
  );
  // Los reveals van ligados al scroll: se les da un momento para llegar.
  await page.waitForTimeout(400);
}

test.describe("La web pública es neobrutalista", () => {
  test("los botones son bloques: casi rectos, con contorno y sombra dura", async ({ page }) => {
    await page.goto("/");
    const portada = page.locator("#portada");
    const primario = portada.getByRole("link", { name: copy.portada.confirmarAsistencia });
    const secundario = portada.getByRole("link", { name: copy.portada.verElDia });
    await quieta(primario.locator(".."));

    // Esquinas casi rectas: dos píxeles, no la píldora de antes.
    expect(
      parseFloat(await primario.evaluate((n) => getComputedStyle(n).borderTopLeftRadius)),
    ).toBe(2);

    // La acción principal lleva la sombra dura en bronce: la gota cálida.
    const sombraPrimario = await sombraDe(primario);
    expect(sombraPrimario).toMatchObject({ x: 3, y: 3, desenfoque: 0 });
    expect(sombraPrimario!.color).toBe(await tintaEn(primario, "tinta-sombra-accion"));

    // El secundario: contorno de dos píxeles de tinta y su sombra de tinta.
    const contorno = await secundario.evaluate((n) => ({
      ancho: parseFloat(getComputedStyle(n).borderTopWidth),
      color: getComputedStyle(n).borderTopColor,
    }));
    expect(contorno.ancho).toBe(2);
    expect(contorno.color).toBe(await tintaEn(secundario, "tinta-contorno-control"));
    expect(await sombraDe(secundario)).toMatchObject({ x: 3, y: 3, desenfoque: 0 });
  });

  test("las tarjetas y los marcos llevan contorno y sombra dura", async ({ page }) => {
    await page.goto("/");

    const tarjeta = page.locator("#alojamiento li").first();
    await alCentro(page, tarjeta);
    await quieta(tarjeta);
    expect(await tarjeta.evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth))).toBe(
      2,
    );
    expect(await sombraDe(tarjeta)).toMatchObject({ x: 5, y: 5, desenfoque: 0 });

    // El mapa de «cómo llegar» es un marco: tres píxeles y la sombra grande.
    const mapa = page.locator("#como-llegar iframe");
    if ((await mapa.count()) > 0) {
      expect(await mapa.evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth))).toBe(
        3,
      );
      expect(await sombraDe(mapa)).toMatchObject({ x: 8, y: 8, desenfoque: 0 });
    }
  });

  test("cada bloque de la página se separa del anterior con una raya de tinta", async ({
    page,
  }) => {
    await page.goto("/");
    const programa = page.locator("#programa");
    const raya = await programa.evaluate((n) => ({
      ancho: parseFloat(getComputedStyle(n).borderTopWidth),
      color: getComputedStyle(n).borderTopColor,
    }));
    expect(raya.ancho).toBe(2);
    expect(raya.color).toBe(await tintaEn(programa, "tinta-contorno"));
  });

  /**
   * EN EL MARINO, LA SOMBRA ES DE BRONCE. Una sombra de tinta marino sobre un
   * fondo marino no se vería: el bloque inverso reasigna la tinta, y las
   * cifras de la cuenta atrás tienen su caja de nieve con la sombra en bronce.
   */
  test("en el bloque marino, contorno de nieve y sombra de bronce", async ({ page }) => {
    await page.goto("/");
    const caja = page.getByRole("timer").locator("> div").first();
    await alCentro(page, caja);
    await quieta(caja);

    const contorno = await caja.evaluate((n) => getComputedStyle(n).borderTopColor);
    expect(contorno).toBe(await tintaEn(caja, "tinta-contorno"));
    expect(contorno, "en el marino, el contorno no puede ser marino").not.toBe(
      await tintaEn(page.locator("#portada"), "tinta-contorno"),
    );
    const sombra = await sombraDe(caja);
    expect(sombra).toMatchObject({ x: 5, y: 5, desenfoque: 0 });
    expect(sombra!.color).toBe(await tintaEn(caja, "tinta-sombra-dura"));
  });

  /**
   * CASO DE ERROR · NINGUNA SOMBRA DIFUMINADA EN LA LANDING. El neobrutalismo
   * es la sombra dura; una difuminada que se cuele —un `shadow-tarjeta` del
   * panel copiado a la web, una sombra escrita a mano— rompe el sistema sin
   * que nadie lo note. Se recorren todos los elementos ya pintados.
   */
  test("en la landing no hay ni una sombra difuminada", async ({ page }) => {
    await page.goto("/");
    const difuminadas = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .map((nodo) => ({ nodo, sombra: getComputedStyle(nodo).boxShadow }))
        .filter(({ sombra }) => sombra !== "none")
        .flatMap(({ nodo, sombra }) =>
          sombra
            .split(/,(?![^(]*\))/)
            .map((capa) =>
              capa
                .replace(/rgba?\([^)]*\)/, "")
                .trim()
                .split(/\s+/),
            )
            .filter((numeros) => parseFloat(numeros[2] ?? "0") > 0)
            .map(() => `${nodo.tagName.toLowerCase()}.${nodo.className}`.slice(0, 120)),
        ),
    );
    expect(difuminadas).toEqual([]);
  });

  test("el RSVP: cada persona en su bloque, y la respuesta elegida se despega", async ({
    page,
  }) => {
    await page.goto("/rsvp/desarrollo-familia-uno-000000");
    const cambiar = page.getByRole("button", { name: copy.rsvp.editarRespuesta });
    if ((await cambiar.count()) > 0) await cambiar.click();

    const persona = page.locator("fieldset").first();
    await expect(persona).toBeVisible();
    expect(await persona.evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth))).toBe(
      2,
    );
    expect(await sombraDe(persona)).toMatchObject({ x: 5, y: 5, desenfoque: 0 });

    const elegida = persona.locator("label:has(input:checked)").first();
    const libre = persona.locator("label:not(:has(input:checked))").first();
    expect(await sombraDe(elegida)).toMatchObject({ x: 3, y: 3, desenfoque: 0 });
    expect(await sombraDe(libre), "la que no está elegida no se despega").toBeNull();
  });

  /**
   * EL SOBRE ES UN MARCO, PERO EL SELLO SIGUE SIENDO DE LACRE: redondo. Los
   * botones cuadrados no pueden arrastrarlo —leía el radio del botón—.
   */
  test("el Save the Date: el sobre con su marco y el sello redondo", async ({ page }) => {
    await page.goto("/reserva-la-fecha");
    const cuerpo = page.locator(".sobre-cuerpo");
    await expect(cuerpo).toBeAttached();
    expect(await cuerpo.evaluate((n) => parseFloat(getComputedStyle(n).outlineWidth))).toBe(2);
    expect(await sombraDe(cuerpo)).toMatchObject({ x: 8, y: 8, desenfoque: 0 });

    const sello = page.locator(".sello").first();
    const radio = await sello.evaluate((n) => ({
      radio: parseFloat(getComputedStyle(n).borderTopLeftRadius),
      lado: n.getBoundingClientRect().width,
    }));
    expect(radio.radio, "el sello es redondo").toBeGreaterThanOrEqual(radio.lado / 2);
  });

  /** CASO DE ERROR · con movimiento reducido, una tarjeta no se mueve al pasar. */
  test("con movimiento reducido las tarjetas no se despegan al pasar", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const tarjeta = page.locator("#alojamiento li").first();
    await alCentro(page, tarjeta);
    await quieta(tarjeta);
    await tarjeta.hover();
    await page.waitForTimeout(400);
    expect(await tarjeta.evaluate((n) => getComputedStyle(n).transform)).toBe("none");
  });
});

/**
 * CASO DE ERROR · EL PANEL NO ES NEOBRUTALISTA. Comparte botones y campos con
 * la web, y `[data-zona="panel"]` les devuelve lo suyo. La puerta del panel
 * —que se ve sin sesión— basta para comprobarlo: si el bloque de la zona se
 * pierde, sus botones salen cuadrados y con sombra dura, y esto lo dice.
 */
test.describe("El panel no es neobrutalista", () => {
  test("la puerta del panel conserva la píldora, sin sombra dura", async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    const entrar = page.getByRole("button", { name: copy.acceso.entrar, exact: true });
    await expect(entrar).toBeVisible();

    const alto = await entrar.evaluate((n) => n.getBoundingClientRect().height);
    expect(
      parseFloat(await entrar.evaluate((n) => getComputedStyle(n).borderTopLeftRadius)),
      "la píldora del panel",
    ).toBeGreaterThanOrEqual(alto / 2);
    const sombra = await sombraDe(entrar);
    expect(sombra === null || (sombra.x === 0 && sombra.y === 0), "sin sombra desplazada").toBe(
      true,
    );
  });

  test("un campo del panel enfocado lleva su anillo de tres píxeles", async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    const campo = page.getByLabel(copy.acceso.correo);
    await campo.focus();
    await expect
      .poll(async () => campo.evaluate((n) => getComputedStyle(n).boxShadow))
      .toContain("0px 0px 0px 3px");
    expect(await campo.evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth))).toBe(1);
  });
});
