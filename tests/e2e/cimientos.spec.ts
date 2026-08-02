import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * BODA-01 · Cimientos
 */
test.describe("Portada", () => {
  test("responde y renderiza el copy del JSON, no texto incrustado", async ({ page }) => {
    const respuesta = await page.goto("/");

    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.meta.titulo);
    await expect(page.getByText(copy.meta.descripcion)).toBeVisible();
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
