import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_CONFIRMAR_ACCESO, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-40 · Entrar al panel
 *
 * Aquí se prueba la puerta con el servidor de autenticación **caído a
 * propósito** (`playwright.config.ts` lo apunta a un puerto cerrado). Puede
 * parecer raro, pero es donde están los fallos que importan: que la puerta se
 * quede abierta cuando algo falla, o que el mensaje de error revele quién tiene
 * acceso.
 *
 * El apretón de manos completo —correo, enlace, sesión— necesita un Supabase de
 * verdad y se prueba en su propio trabajo de CI.
 */

test.describe("Página de acceso", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
  });

  test("pide el correo y nada más", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.acceso.titulo);

    const campo = page.getByLabel(copy.acceso.correo);
    await expect(campo).toBeVisible();
    await expect(campo).toHaveAttribute("type", "email");

    // Sin contraseñas: si algún día aparece un campo de contraseña aquí, es que
    // alguien ha cambiado de idea sin decirlo.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("no se indexa", async ({ request }) => {
    const respuesta = await request.get(RUTA_ACCESO);
    expect(respuesta.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });

  test("el formulario funciona sin JavaScript", async ({ browser }) => {
    // La puerta de entrada no puede depender de que cargue un script.
    const contexto = await browser.newContext({ javaScriptEnabled: false });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto(RUTA_ACCESO);
      await pagina.getByLabel(copy.acceso.correo).fill("alguien@ejemplo.test");
      await pagina.getByRole("button", { name: copy.acceso.enviar }).click();

      await expect(pagina.getByRole("main").getByRole("status")).toHaveText(
        copy.acceso.comprobadCorreo,
      );
    } finally {
      await contexto.close();
    }
  });

  test("el campo es cómodo de escribir en un móvil", async ({ page }) => {
    const campo = page.getByLabel(copy.acceso.correo);

    // Con autocapitalización, el teclado del móvil escribe «Alguien@…» y el
    // correo no llega. Con autocorrección, peor.
    await expect(campo).toHaveAttribute("autocapitalize", "none");
    await expect(campo).toHaveAttribute("autocorrect", "off");
    await expect(campo).toHaveAttribute("autocomplete", "email");
  });

  // --- Lo que no se puede filtrar --------------------------------------

  test("la respuesta es la misma para cualquier correo", async ({ page }) => {
    // Es la propiedad que de verdad importa: con dos personas con acceso, un
    // mensaje que distinguiera convertiría esta página en un comprobador de
    // quién lo tiene.
    const respuestas: string[] = [];

    for (const correo of ["paloma@ejemplo.test", "nadie-de-nadie@ejemplo.test"]) {
      await page.goto(RUTA_ACCESO);
      await page.getByLabel(copy.acceso.correo).fill(correo);
      await page.getByRole("button", { name: copy.acceso.enviar }).click();
      const anuncio = page.getByRole("main").getByRole("status");
      await expect(anuncio).toBeVisible();
      respuestas.push((await anuncio.textContent()) ?? "");
    }

    expect(respuestas[0]).toBe(respuestas[1]);
    expect(respuestas[0]).toBe(copy.acceso.comprobadCorreo);
  });

  test("con el servidor de autenticación caído, el mensaje no cambia", async ({ page }) => {
    // Está caído durante toda esta suite. Aun así no se enseña un error
    // técnico ni se deja entrar a nadie: se responde lo mismo de siempre.
    await page.getByLabel(copy.acceso.correo).fill("paloma@ejemplo.test");
    await page.getByRole("button", { name: copy.acceso.enviar }).click();

    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      copy.acceso.comprobadCorreo,
    );
    await expect(page).toHaveURL(new RegExp(`${RUTA_ACCESO}\\?estado=enviado$`));
  });
});

test.describe("La puerta del panel", () => {
  test("sin sesión, el panel devuelve a la página de acceso", async ({ page }) => {
    await page.goto(RUTA_PANEL);

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.acceso.titulo);
  });

  test("el panel no filtra nada antes de redirigir", async ({ page }) => {
    const respuesta = await page.goto(RUTA_PANEL);

    // Ni el nombre de quien podría haber entrado, ni el rol, ni una pista de
    // qué hay dentro.
    expect(respuesta?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(copy.acceso.cerrarSesion);
  });

  test("un enlace sin token no deja entrar", async ({ page }) => {
    await page.goto(RUTA_CONFIRMAR_ACCESO);

    await expect(page).toHaveURL(new RegExp("estado=enlace-invalido"));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(copy.acceso.errorEnlace);
  });

  test("un token inventado tampoco", async ({ page }) => {
    await page.goto(`${RUTA_CONFIRMAR_ACCESO}?token_hash=inventado&type=email`);

    await expect(page).toHaveURL(new RegExp("estado=enlace-invalido"));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(copy.acceso.errorEnlace);
  });

  test("el panel no se indexa", async ({ request }) => {
    const respuesta = await request.get(RUTA_PANEL);
    expect(respuesta.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });
});
