import { expect, test, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import {
  LONGITUD_MINIMA_CONTRASENA,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_NUEVA_CONTRASENA,
  RUTA_PANEL,
  RUTA_PRESUPUESTO,
} from "../../src/config/constants";

/**
 * EL MARCO DEL PANEL: TÍTULOS, LO QUE NO EXISTE Y LA CONTRASEÑA NUEVA
 *
 * Hallazgos de la auditoría del panel que no son de ningún módulo:
 *
 * · Todas las pantallas se titulaban «Panel», y el anunciador de rutas de Next
 *   —que sólo habla cuando cambia el título— callaba al pasar de un módulo a
 *   otro.
 * · Lo que no existe dentro del panel sacaba a la 404 de los invitados, sin
 *   menú y con un botón a la portada pública.
 * · La pantalla de la contraseña nueva respondía «No hemos podido entrar» a
 *   todo, y un `?estado=` inventado pintaba ese error.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

test.describe("El marco del panel", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: sólo corre en el trabajo de CI que lo levanta.",
  );

  test("cada pantalla tiene su título, y cambia al pasar de una a otra", async ({ page }) => {
    await entrar(page);

    await page.goto(RUTA_INVITADOS);
    await expect(page).toHaveTitle(`${copy.panel.invitados.titulo} · ${copy.panel.titulo}`);

    await page
      .getByRole("navigation", { name: copy.panel.navegacion })
      .first()
      .getByRole("link", { name: copy.panel.modulos.presupuesto })
      .click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_PRESUPUESTO}$`));
    await expect(page).toHaveTitle(`${copy.panel.presupuesto.titulo} · ${copy.panel.titulo}`);
  });

  test("una invitación que no existe se dice dentro del panel, con su menú", async ({
    page,
  }) => {
    await entrar(page);

    /*
      No se mira el código de estado: el marco del panel ya ha empezado a
      llegar cuando la página dice que no existe, y Next contesta 200 con
      `noindex`. Lo que importa aquí es lo que ve quien lo abre.
    */
    await page.goto(`${RUTA_INVITADOS}/00000000-0000-4000-8000-000000000000`);
    await expect(
      page.getByRole("heading", { level: 1, name: copy.panel.noEncontrado.titulo }),
    ).toBeVisible();
    // El menú del panel sigue ahí, y la salida lleva al panel, no a la web.
    await expect(
      page.getByRole("navigation", { name: copy.panel.navegacion }).first(),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: copy.panel.noEncontrado.volver }),
    ).toHaveAttribute("href", RUTA_PANEL);
    await expect(page.getByText(copy.errores.volverAlInicio)).toHaveCount(0);
  });

  test("una dirección del panel que no casa con nada, también", async ({ page }) => {
    await entrar(page);

    await page.goto(`${RUTA_PANEL}/esto-no-existe`);
    await expect(
      page.getByRole("heading", { level: 1, name: copy.panel.noEncontrado.titulo }),
    ).toBeVisible();
  });

  test("la contraseña nueva dice el mínimo que pide, y no inventa errores", async ({
    page,
  }) => {
    await entrar(page);

    // Un estado que la pantalla no conoce no pinta nada.
    await page.goto(`${RUTA_NUEVA_CONTRASENA}?estado=inventado`);
    await expect(page.getByLabel(copy.acceso.nuevaContrasena)).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByText(
        copy.acceso.nuevaAyuda.replace("{minimo}", String(LONGITUD_MINIMA_CONTRASENA)),
      ),
    ).toBeVisible();

    await page.goto(`${RUTA_NUEVA_CONTRASENA}?estado=corta`);
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      copy.acceso.nuevaCorta.replace("{minimo}", String(LONGITUD_MINIMA_CONTRASENA)),
    );
  });

  /**
   * CASO DE ERROR · repetir la contraseña que ya se tenía. Auth contesta
   * `same_password`, y la pantalla decía «No hemos podido entrar. Inténtalo de
   * nuevo», que invita a repetir algo que va a fallar siempre. No cambia nada:
   * la contraseña es la misma.
   */
  test("guardar la misma contraseña que ya se tenía lo dice", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_NUEVA_CONTRASENA);

    await page.getByLabel(copy.acceso.nuevaContrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.nuevaGuardar }).click();

    await expect(page).toHaveURL(/estado=repetida/);
    await expect(page.locator("main").getByRole("alert")).toHaveText(copy.acceso.nuevaRepetida);
    await expect(page.getByText(copy.acceso.errorGenerico)).toHaveCount(0);
  });
});
