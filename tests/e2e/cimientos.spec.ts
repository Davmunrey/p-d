import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * BODA-01 · Cimientos
 *
 * Lo básico que debe cumplirse siempre, independientemente de lo que muestre
 * cada sección: que la página responde, que declara el idioma y que una ruta
 * inventada no revienta.
 */
test.describe("Portada", () => {
  test("responde y renderiza contenido real", async ({ page }) => {
    const respuesta = await page.goto("/");

    expect(respuesta?.status()).toBe(200);
    // El título viene de la base de datos (los nombres de los novios), no de un
    // literal: por eso se comprueba que hay uno y que no está vacío, y son los
    // tests de landing los que verifican su procedencia.
    const titulo = page.getByRole("heading", { level: 1 }).first();
    await expect(titulo).toBeVisible();
    await expect(titulo).not.toHaveText("");
  });

  test("los rótulos de interfaz salen del fichero de copys", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: copy.portada.confirmarAsistencia }).first(),
    ).toBeVisible();
  });

  test("el documento declara castellano", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
  });

  // Caso de error obligatorio: una ruta inexistente no revienta.
  test("una ruta que no existe devuelve 404", async ({ page }) => {
    const respuesta = await page.goto("/esta-ruta-no-existe");
    expect(respuesta?.status()).toBe(404);
  });
});

/**
 * Cabeceras de seguridad.
 *
 * Vivían en `netlify.toml` y al pasar a Vercel se movieron a `next.config.ts`.
 * Un cambio de plataforma es justo el momento en que estas cosas se pierden en
 * silencio, así que quedan comprobadas.
 */
test.describe("Cabeceras de seguridad", () => {
  test("la web se sirve con las protecciones básicas", async ({ request }) => {
    const respuesta = await request.get("/");
    const cabeceras = respuesta.headers();

    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
    expect(cabeceras["x-frame-options"]).toBe("DENY");
    // Importante aquí: las URL del RSVP llevan el token dentro, y sin esto se
    // filtraría entero al navegar a un dominio externo.
    expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("el sistema de diseño no se indexa", async ({ request }) => {
    const respuesta = await request.get("/cocina");
    expect(respuesta.headers()["x-robots-tag"]).toContain("noindex");
  });
});
