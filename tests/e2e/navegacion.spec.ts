import { expect, test, type Page } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { conSeccionApagada } from "./utiles/secciones";

/**
 * BODA-20 · Navegación y pie
 *
 * Lo que se prueba aquí no es que el menú se vea, sino que **sale de la base de
 * datos**: `secciones_landing` decide qué secciones hay y en qué orden, y la
 * política RLS de esa tabla (`using (visible)`) hace que a un invitado ni
 * siquiera le lleguen las apagadas.
 *
 * Los dos casos de error son los que de verdad importan y los que fallarían si
 * alguien escribiera el menú a mano:
 *
 *  1. Una sección APAGADA en la base de datos no puede aparecer (`regalos`).
 *  2. Una sección ENCENDIDA pero todavía sin construir tampoco (`galeria` y
 *     `ubicaciones`, que son BODA-25 y BODA-26). Un menú que ofrece un enlace
 *     a una sección que no existe es peor que no tener menú.
 */

const menu = (page: Page) =>
  page.getByRole("navigation", { name: copy.navegacion.etiquetaPrincipal });

test.describe("Navegación", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("el menú lista las secciones que la base de datos da por visibles", async ({ page }) => {
    const enlaces = menu(page).getByRole("link");

    await expect(enlaces.filter({ hasText: copy.navegacion.secciones.portada })).toHaveCount(1);
    await expect(enlaces.filter({ hasText: copy.navegacion.secciones.programa })).toHaveCount(
      1,
    );
    await expect(enlaces.filter({ hasText: copy.navegacion.secciones.rsvp })).toHaveCount(1);
  });

  test("el orden del menú es el que manda la base de datos", async ({ page }) => {
    // `orden` en la tabla: portada 0 · cuenta_atras 10 · historia 20 ·
    // preboda 33 · programa 35 · transporte 50 · alojamiento 60 ·
    // preguntas 70 · playlist 75 · regalos 76 · dresscode 77 · rsvp 80. Si
    // alguien reordena el JSX, esto se cae.
    // `allTextContents` y no `allInnerTexts`: el segundo devuelve el texto ya
    // pasado por el `text-transform: uppercase` del CSS, así que compararía
    // contra la presentación en vez de contra el copy.
    const rotulos = await menu(page).getByRole("link").allTextContents();

    expect(rotulos.map((rotulo) => rotulo.trim())).toEqual([
      copy.navegacion.secciones.portada,
      copy.navegacion.secciones.cuenta_atras,
      copy.navegacion.secciones.historia,
      copy.navegacion.secciones.preboda,
      copy.navegacion.secciones.programa,
      copy.navegacion.secciones.transporte,
      copy.navegacion.secciones.alojamiento,
      copy.navegacion.secciones.preguntas_frecuentes,
      copy.navegacion.secciones.playlist,
      copy.navegacion.secciones.regalos,
      copy.navegacion.secciones.dresscode,
      copy.navegacion.secciones.rsvp,
    ]);
  });

  test("pulsar un enlace del menú lleva a su sección", async ({ page }) => {
    await menu(page).getByRole("link", { name: copy.navegacion.secciones.playlist }).click();

    await expect(page).toHaveURL(/#playlist$/);
    await expect(page.locator("#playlist")).toBeInViewport();
  });

  test("la sección de destino no se queda debajo de la barra", async ({ page }) => {
    await menu(page).getByRole("link", { name: copy.navegacion.secciones.alojamiento }).click();

    // El `scroll-margin-top` tiene que dejar el título de la sección por debajo
    // de la barra fija, no tapado por ella.
    const barra = page.locator("header").first();
    const seccion = page.locator("#alojamiento");

    const cajaBarra = await barra.boundingBox();
    const cajaSeccion = await seccion.boundingBox();

    expect(cajaBarra).not.toBeNull();
    expect(cajaSeccion).not.toBeNull();
    expect(cajaSeccion!.y).toBeGreaterThanOrEqual(cajaBarra!.y + cajaBarra!.height - 1);
  });

  test("ningún enlace del menú lleva a una sección que no existe", async ({ page }) => {
    const destinos = await menu(page)
      .getByRole("link")
      .evaluateAll((enlaces) =>
        enlaces.map((enlace) => (enlace as HTMLAnchorElement).getAttribute("href") ?? ""),
      );

    expect(destinos.length).toBeGreaterThan(0);
    for (const destino of destinos) {
      expect(destino.startsWith("#")).toBe(true);
      await expect(page.locator(destino)).toHaveCount(1);
    }
  });

  test("marca la sección en la que está el invitado", async ({ page }) => {
    await page.locator("#programa").scrollIntoViewIfNeeded();

    const activo = menu(page).getByRole("link", { name: copy.navegacion.secciones.programa });
    await expect(activo).toHaveAttribute("aria-current", "location");
  });

  // --- Casos de error -----------------------------------------------------

  test("una sección apagada en la base de datos no aparece en el menú", async ({ page }) => {
    /*
      `reserva_la_fecha` no vale para esto —es una página aparte y no sale en
      el menú aunque esté encendida—, así que el caso se prueba apagando una
      sección de verdad y devolviéndola después. Antes se usaba `regalos`
      porque nacía apagada; desde que el seed la enciende, dar por hecho que
      alguna sección está apagada es atarse a un dato que puede cambiar.
    */
    await conSeccionApagada("dresscode", async () => {
      await page.goto("/");
      await expect(
        menu(page).getByRole("link", { name: copy.navegacion.secciones.dresscode }),
      ).toHaveCount(0);
      await expect(page.locator("#dresscode")).toHaveCount(0);
    });
  });

  test("una sección encendida pero sin construir tampoco aparece", async ({ page }) => {
    // `galeria` y `ubicaciones` están visibles en la base de datos desde el
    // primer día, y su código todavía no existe.
    await expect(
      menu(page).getByRole("link", { name: copy.navegacion.secciones.galeria }),
    ).toHaveCount(0);
    await expect(
      menu(page).getByRole("link", { name: copy.navegacion.secciones.ubicaciones }),
    ).toHaveCount(0);
  });

  test("la reserva de fecha es una página aparte y no se cuela en el menú", async ({
    page,
  }) => {
    await expect(
      menu(page).getByRole("link", { name: copy.navegacion.secciones.reserva_la_fecha }),
    ).toHaveCount(0);
  });
});

test.describe("Accesibilidad de la navegación", () => {
  test("el primer elemento enfocable salta al contenido", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const enfocado = page.locator(":focus");
    await expect(enfocado).toHaveText(copy.navegacion.irAlContenido);
    await expect(enfocado).toHaveAttribute("href", "#contenido");
    // Oculto hasta que se enfoca, pero visible en cuanto lo está.
    await expect(enfocado).toBeInViewport();
  });

  test("se puede recorrer el menú entero con el teclado", async ({ page }) => {
    await page.goto("/");

    const primerEnlace = menu(page).getByRole("link").first();
    await primerEnlace.focus();
    await expect(primerEnlace).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(menu(page).getByRole("link").nth(1)).toBeFocused();
  });

  test("hay dos navegaciones y cada una se identifica", async ({ page }) => {
    await page.goto("/");
    await expect(menu(page)).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: copy.pie.etiquetaNavegacion }),
    ).toHaveCount(1);
  });
});

test.describe("Pie", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("el correo de contacto sale de la base de datos", async ({ page }) => {
    const pie = page.getByRole("contentinfo");
    const correo = pie.getByRole("link", { name: /@/ });

    await expect(correo).toBeVisible();
    await expect(correo).toHaveAttribute("href", /^mailto:/);
  });

  test("el hashtag se pinta con el de la base de datos", async ({ page }) => {
    await expect(page.getByRole("contentinfo").getByText(/^#/)).toBeVisible();
  });

  test("desde el pie se puede volver arriba", async ({ page }) => {
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: copy.pie.volverArriba })
      .click();

    await expect(page.locator("#portada")).toBeInViewport();
  });
});
