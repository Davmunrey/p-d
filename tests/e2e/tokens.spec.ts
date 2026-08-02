import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * BODA-02 · Sistema de design tokens
 *
 * Lo que se verifica no es que la página se vea bonita, sino que la ARQUITECTURA
 * de tokens funciona: que los semánticos resuelven, que el tema oscuro los
 * reasigna sin tocar componentes, y que la preferencia persiste.
 */

/** Lee el valor computado de una variable CSS en el elemento raíz. */
async function leerToken(page: import("@playwright/test").Page, token: string) {
  return page.evaluate(
    (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim(),
    `--${token}`,
  );
}

test.describe("Sistema de diseño", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cocina");
  });

  test("los tokens semánticos resuelven a un valor real", async ({ page }) => {
    for (const token of ["fondo", "superficie", "tinta", "marca", "borde", "foco"]) {
      expect(await leerToken(page, token), `El token --${token} no resuelve`).not.toBe("");
    }
  });

  test("el puente con Tailwind apunta al mismo token que la capa semántica", async ({
    page,
  }) => {
    // `bg-superficie` (utilidad) y `var(--superficie)` (CSS) deben ser lo mismo.
    const viaTailwind = await leerToken(page, "color-superficie");
    const viaSemantico = await leerToken(page, "superficie");

    expect(viaTailwind).not.toBe("");
    expect(viaTailwind).toBe(viaSemantico);
  });

  test("el tema oscuro reasigna semánticos sin tocar componentes", async ({ page }) => {
    const fondoClaro = await leerToken(page, "fondo");
    const tintaClara = await leerToken(page, "tinta");

    await page.getByRole("button", { name: copy.cocina.temaOscuro }).click();

    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
    expect(await leerToken(page, "fondo")).not.toBe(fondoClaro);
    expect(await leerToken(page, "tinta")).not.toBe(tintaClara);
  });

  test("la preferencia de tema sobrevive a una recarga", async ({ page }) => {
    await page.getByRole("button", { name: copy.cocina.temaOscuro }).click();
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");

    await page.reload();

    // Aplicado antes del primer pintado: sin fogonazo blanco.
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
    await expect(page.getByRole("button", { name: copy.cocina.temaOscuro })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("el selector de tema es accesible por teclado", async ({ page }) => {
    const boton = page.getByRole("button", { name: copy.cocina.temaOscuro });
    await boton.focus();
    await expect(boton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  });

  test("se muestran todos los grupos de tokens de color", async ({ page }) => {
    for (const grupo of [
      copy.cocina.grupoSuperficies,
      copy.cocina.grupoTinta,
      copy.cocina.grupoMarca,
      copy.cocina.grupoBordes,
      copy.cocina.grupoEstado,
    ]) {
      await expect(page.getByRole("heading", { name: grupo })).toBeVisible();
    }
  });
});

/**
 * Caso de error / accesibilidad: con `prefers-reduced-motion` activado, las
 * animaciones se reducen. No es un extra: hay personas a las que el movimiento
 * les provoca mareo real.
 */
test.describe("Movimiento reducido", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("el CSS entregado contiene la regla de movimiento reducido", async ({ page }) => {
    await page.goto("/cocina");

    // Independiente de que el navegador sepa emular la preferencia: comprueba
    // que la regla existe en la hoja de estilos que llega al invitado.
    const tieneRegla = await page.evaluate(() =>
      Array.from(document.styleSheets).some((hoja) => {
        try {
          return Array.from(hoja.cssRules).some(
            (regla) =>
              regla instanceof CSSMediaRule &&
              regla.conditionText.includes("prefers-reduced-motion"),
          );
        } catch {
          // Hoja de otro origen: no se puede inspeccionar, no es la nuestra.
          return false;
        }
      }),
    );

    expect(tieneRegla).toBe(true);
  });

  test("las animaciones se acortan al mínimo", async ({ page }) => {
    await page.goto("/cocina");

    const emulacionActiva = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    // Algunos navegadores de contenedor no aplican la emulación de Playwright.
    // Mejor saltar que dar un verde falso.
    test.skip(
      !emulacionActiva,
      "Este navegador no aplica la emulación de prefers-reduced-motion",
    );

    const duracion = await page
      .locator(".animacion-aparecer-subiendo")
      .first()
      .evaluate((elemento) => getComputedStyle(elemento).animationDuration);

    // El token --duration-instant vale 100ms.
    expect(duracion).toBe("0.1s");
  });
});
