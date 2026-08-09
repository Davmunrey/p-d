import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { PARAMETRO_VOLVER, RUTA_ACCESO, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-41 · La puerta del panel, antes de pintar nada
 *
 * Corre con el servidor de autenticación caído a propósito, como el resto de
 * `acceso.spec.ts`: aquí lo que se comprueba es que **sin sesión no se entra**,
 * y sin sesión es exactamente lo que hay.
 *
 * Las rutas de dentro del panel todavía no existen, y da igual: el middleware
 * decide antes de que Next mire si hay página. Que un enlace a una pantalla
 * futura ya acabe en la puerta es justo lo que se quiere.
 */

const RUTA_INTERNA = `${RUTA_PANEL}/invitados`;

test.describe("Protección del panel", () => {
  test("una ruta de dentro del panel acaba en la puerta", async ({ page }) => {
    await page.goto(RUTA_INTERNA);

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.acceso.titulo);
  });

  test("y se anota a dónde quería ir", async ({ page }) => {
    await page.goto(RUTA_INTERNA);

    // Sin esto, quien abre un enlace directo a una pantalla concreta entra y
    // aparece en la portada, teniendo que buscar otra vez lo que ya pidió.
    expect(new URL(page.url()).searchParams.get(PARAMETRO_VOLVER)).toBe(RUTA_INTERNA);
  });

  test("el destino viaja en el formulario, no en la URL", async ({ page }) => {
    // Tiene que funcionar sin JavaScript: si el destino no va dentro del
    // `<form>`, al enviar no hay forma de leerlo.
    await page.goto(RUTA_INTERNA);

    await expect(
      page.locator(`form input[type="hidden"][name="${PARAMETRO_VOLVER}"]`),
    ).toHaveValue(RUTA_INTERNA);
  });

  test("no se ve nada del panel por el camino", async ({ page }) => {
    const respuesta = await page.goto(RUTA_INTERNA);

    // Ni un 500 ni un vistazo a la estructura: una redirección limpia.
    expect(respuesta?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(copy.acceso.cerrarSesion);
  });

  test("el panel sigue sin indexarse", async ({ request }) => {
    const respuesta = await request.get(RUTA_PANEL);
    expect(respuesta.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });

  // --- Lo que no puede colarse -----------------------------------------

  test("un destino fuera de casa se ignora", async ({ page }) => {
    // Sin esta comprobación, un enlace a `/acceso?volver=https://otro-sitio`
    // convertiría nuestra puerta en un trampolín hacia cualquier parte, con la
    // credibilidad de nuestro dominio detrás.
    for (const trampa of ["https://otro-sitio.test/", "//otro-sitio.test/", "/etc/passwd"]) {
      await page.goto(`${RUTA_ACCESO}?${PARAMETRO_VOLVER}=${encodeURIComponent(trampa)}`);
      await page.getByLabel(copy.acceso.correo).fill("paloma@ejemplo.test");
      await page.getByLabel(copy.acceso.contrasena).fill("da-igual-lo-que-ponga");
      await page.getByRole("button", { name: copy.acceso.entrar }).click();

      // Con el servidor caído no entra de todos modos, pero lo que importa es
      // que en ningún momento se sale del sitio.
      await expect(page).toHaveURL(new RegExp(`^http://[^/]+${RUTA_ACCESO}`));
    }
  });

  test("la web pública no la toca", async ({ page }) => {
    // El middleware pasa por todas las rutas para renovar la sesión, no para
    // pedirla. Si empezara a exigirla fuera del panel, la boda se quedaría sin
    // invitación.
    const respuesta = await page.goto("/");
    expect(respuesta?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
  });
});
