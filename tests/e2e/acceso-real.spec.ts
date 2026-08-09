import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-40 · El recorrido completo, contra un Supabase de verdad
 *
 * Lo que `acceso.spec.ts` no puede probar: identificarse de verdad y entrar.
 * Hace falta GoTrue funcionando, así que este fichero solo corre en el trabajo
 * de CI que levanta el Supabase local.
 *
 * Se salta en cualquier otro sitio en lugar de fallar: un test que no puede
 * ejecutarse no es un test roto.
 *
 * ENTRAR, ESTAR Y SALIR VAN EN UN SOLO TEST, y no es por pereza. Cada test de
 * Playwright estrena navegador: contexto nuevo, cookies vacías. Repartir el
 * recorrido en tres dejaba al segundo sin la sesión que abrió el primero, y el
 * fallo —«el panel me echa»— parecía de la aplicación cuando era del test.
 * Una sesión es una sola historia y se cuenta seguida.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CORREO_SIN_ACCESO = process.env.CORREO_SIN_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

test.describe("Acceso de verdad", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CORREO_SIN_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  async function identificarse(
    page: import("@playwright/test").Page,
    correo: string,
    contrasena = CONTRASENA!,
  ) {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(correo);
    await page.getByLabel(copy.acceso.contrasena).fill(contrasena);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
  }

  test("entrar, seguir dentro y salir de verdad", async ({ page }) => {
    await identificarse(page, CORREO_CON_ACCESO!);

    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toBeVisible();

    // La sesión aguanta una recarga: vive en la cookie, no en la memoria de la
    // pestaña.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    // Y con sesión, la puerta deja de tener sentido: lleva dentro en lugar de
    // volver a pedir lo que ya se ha dado.
    await page.goto(RUTA_ACCESO);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    await page.getByRole("button", { name: copy.acceso.cerrarSesion }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    // Salir tiene que ser salir: volver al panel escribiendo la URL tampoco
    // entra. Si la sesión sólo se borrara en el navegador, esto pasaría.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toHaveCount(0);
  });

  test("entrar tras ser redirigido lleva a donde se pedía", async ({ page }) => {
    // BODA-41. La ruta interna todavía no tiene página, y para esto da igual:
    // lo que se prueba es que el destino sobrevive al viaje —puerta, sesión,
    // vuelta— y no que haya algo pintado al llegar. El día que exista, este
    // test seguirá valiendo sin tocarlo.
    const pedida = `${RUTA_PANEL}/invitados`;

    await page.goto(pedida);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();

    await expect(page).toHaveURL(new RegExp(`${pedida}$`));
  });

  // --- Los casos que de verdad importan --------------------------------

  test("la contraseña incorrecta no entra", async ({ page }) => {
    await identificarse(page, CORREO_CON_ACCESO!, "esta-no-es-la-contrasena");

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      copy.acceso.errorCredenciales,
    );
  });

  test("identificarse bien pero sin perfil activo tampoco entra", async ({ page }) => {
    // Este usuario existe y acierta la contraseña: Supabase lo autentica sin
    // problema. Lo que no tiene es perfil activo, y eso lo decide `perfiles`.
    // Es la diferencia entre «autenticado» y «con acceso».
    await identificarse(page, CORREO_SIN_ACCESO!);

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(
      copy.acceso.titulo,
    );
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toHaveCount(0);

    // Y además se le cierra la sesión: si se le dejara una abierta, andaría
    // rebotando en la puerta sin entender por qué.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
  });

  test("y el mensaje es el mismo que con la contraseña mal", async ({ page }) => {
    // Si el desactivado recibiera un mensaje propio, cualquiera podría
    // averiguar qué correos existen probando.
    await identificarse(page, CORREO_SIN_ACCESO!);
    const sinPerfil = await page.getByRole("main").getByRole("alert").textContent();

    await identificarse(page, CORREO_CON_ACCESO!, "esta-no-es-la-contrasena");
    const malaContrasena = await page.getByRole("main").getByRole("alert").textContent();

    expect(sinPerfil).toBe(malaContrasena);
  });
});
