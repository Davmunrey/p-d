import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_CONFIRMAR_ACCESO,
  RUTA_NUEVA_CONTRASENA,
  RUTA_PANEL,
  RUTA_RECUPERAR,
} from "../../src/config/constants";

/**
 * BODA-40 · Entrar al panel
 *
 * Aquí se prueba la puerta con el servidor de autenticación **caído a
 * propósito** (`playwright.config.ts` lo apunta a un puerto cerrado). Puede
 * parecer raro, pero es donde están los fallos que importan: que la puerta se
 * quede abierta cuando algo falla, o que el error revele quién tiene acceso.
 *
 * El recorrido con credenciales de verdad se prueba en su propio trabajo de
 * CI, que levanta un Supabase completo.
 */

test.describe("Página de acceso", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
  });

  test("pide correo y contraseña", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.acceso.titulo);

    const correo = page.getByLabel(copy.acceso.correo);
    await expect(correo).toBeVisible();
    await expect(correo).toHaveAttribute("type", "email");

    const contrasena = page.getByLabel(copy.acceso.contrasena);
    await expect(contrasena).toBeVisible();
    await expect(contrasena).toHaveAttribute("type", "password");
  });

  test("el gestor de contraseñas del navegador sabe qué guardar", async ({ page }) => {
    // Sin estos `autocomplete`, ni el llavero del móvil ni el gestor del
    // navegador ofrecen guardar ni rellenar, y acaban escribiéndose a mano.
    await expect(page.getByLabel(copy.acceso.correo)).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await expect(page.getByLabel(copy.acceso.contrasena)).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
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
      await pagina.getByLabel(copy.acceso.contrasena).fill("una-contrasena-larga");
      await pagina.getByRole("button", { name: copy.acceso.entrar }).click();

      // Con el servidor caído no entra, pero responde: la página vive.
      await expect(pagina).toHaveURL(new RegExp(RUTA_ACCESO));
      await expect(pagina.getByRole("main").getByRole("alert")).toBeVisible();
    } finally {
      await contexto.close();
    }
  });

  test("el correo es cómodo de escribir en un móvil", async ({ page }) => {
    const campo = page.getByLabel(copy.acceso.correo);

    // Con autocapitalización, el teclado del móvil escribe «Paloma@…» y el
    // acceso falla sin que se vea por qué.
    await expect(campo).toHaveAttribute("autocapitalize", "none");
    await expect(campo).toHaveAttribute("autocorrect", "off");
  });

  // --- Lo que no se puede filtrar --------------------------------------

  test("un correo que no existe y una contraseña mala dicen lo mismo", async ({ page }) => {
    // Es la propiedad que de verdad importa: si distinguieran, esta página
    // sería un comprobador de qué correos tienen acceso al panel.
    const respuestas: string[] = [];

    for (const correo of ["paloma@ejemplo.test", "nadie-de-nadie@ejemplo.test"]) {
      await page.goto(RUTA_ACCESO);
      await page.getByLabel(copy.acceso.correo).fill(correo);
      await page.getByLabel(copy.acceso.contrasena).fill("da-igual-lo-que-ponga");
      await page.getByRole("button", { name: copy.acceso.entrar }).click();

      const aviso = page.getByRole("main").getByRole("alert");
      await expect(aviso).toBeVisible();
      respuestas.push((await aviso.textContent()) ?? "");
    }

    expect(respuestas[0]).toBe(respuestas[1]);
  });

  test("el error no cuenta qué ha fallado por dentro", async ({ page }) => {
    await page.getByLabel(copy.acceso.correo).fill("paloma@ejemplo.test");
    await page.getByLabel(copy.acceso.contrasena).fill("da-igual");
    await page.getByRole("button", { name: copy.acceso.entrar }).click();

    const cuerpo = page.locator("body");
    // Nada de «fetch failed», nombres de servicio ni rastros de pila.
    await expect(cuerpo).not.toContainText("fetch");
    await expect(cuerpo).not.toContainText("supabase");
    await expect(cuerpo).not.toContainText("Error:");
  });
});

test.describe("Recuperar la contraseña", () => {
  test("se llega desde la página de acceso", async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByRole("link", { name: copy.acceso.olvidada }).click();

    await expect(page).toHaveURL(new RegExp(RUTA_RECUPERAR));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.acceso.recuperarTitulo,
    );
  });

  test("la respuesta es la misma exista o no el correo", async ({ page }) => {
    const respuestas: string[] = [];

    for (const correo of ["paloma@ejemplo.test", "nadie-de-nadie@ejemplo.test"]) {
      await page.goto(RUTA_RECUPERAR);
      await page.getByLabel(copy.acceso.correo).fill(correo);
      await page.getByRole("button", { name: copy.acceso.recuperarEnviar }).click();

      const anuncio = page.getByRole("main").getByRole("status");
      await expect(anuncio).toBeVisible();
      respuestas.push((await anuncio.textContent()) ?? "");
    }

    expect(respuestas[0]).toBe(respuestas[1]);
    expect(respuestas[0]).toBe(copy.acceso.recuperarEnviado);
  });

  test("sin sesión no se puede poner una contraseña nueva", async ({ page }) => {
    // Si esto no redirigiera, la página sería una forma de cambiarle la
    // contraseña a cualquiera con solo escribir la URL.
    await page.goto(RUTA_NUEVA_CONTRASENA);

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.acceso.titulo);
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

    expect(respuesta?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(copy.acceso.cerrarSesion);
  });

  test("un enlace de recuperación sin token no deja entrar", async ({ page }) => {
    await page.goto(RUTA_CONFIRMAR_ACCESO);

    await expect(page).toHaveURL(new RegExp("estado=enlace-invalido"));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(copy.acceso.errorEnlace);
  });

  test("un token inventado tampoco", async ({ page }) => {
    await page.goto(`${RUTA_CONFIRMAR_ACCESO}?token_hash=inventado&type=recovery`);

    await expect(page).toHaveURL(new RegExp("estado=enlace-invalido"));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(copy.acceso.errorEnlace);
  });

  test("el panel no se indexa", async ({ request }) => {
    const respuesta = await request.get(RUTA_PANEL);
    expect(respuesta.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });
});
