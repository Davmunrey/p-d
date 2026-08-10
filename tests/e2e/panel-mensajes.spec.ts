import { expect, test, type Page } from "@playwright/test";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_MENSAJES,
  RUTA_PANEL,
} from "../../src/config/constants";

/**
 * BODA-112/113 · Lo que escriben los invitados
 *
 * Lo que se comprueba no es que la bandeja se vea, sino que **cierra el
 * círculo**: alguien escribe un mensaje al confirmar y aparece aquí; alguien
 * pide una canción de broma y se puede retirar de la web sin borrarla.
 *
 * El caso de error de la playlist se prueba donde importa —en el HTML que
 * recibe un invitado— y no mirando la pantalla del panel: una canción que
 * sigue en la landing después de ocultarla es el único fallo que de verdad
 * cuenta.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

const MARCA = "(DES) E2E Mensajes";

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

test.describe.configure({ mode: "serial" });

test.describe("Bandeja de mensajes", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test("un mensaje dejado al confirmar aparece con su grupo", async ({ page, browser }) => {
    const nombreGrupo = `${MARCA} ${Date.now()}`;
    const mensaje = `(DES) Mensaje de prueba ${Date.now()}`;
    const cancion = `(DES) Canción de prueba ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_INVITADOS}/[0-9a-f-]{36}`));
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Iria");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Iria")).toBeVisible();

    // La invitada confirma y escribe.
    const contexto = await browser.newContext({ locale: "es-ES" });
    const invitada = await contexto.newPage();
    await invitada.goto(new URL(enlace).pathname);
    await invitada.locator('input[value="confirmado"]').first().check();

    // Un paso cada vez: con JavaScript encendido el botón del paso anterior
    // sigue en el DOM mientras la acción de servidor va y vuelve, así que dos
    // clics seguidos caen los dos en el mismo formulario.
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(invitada.getByText(copy.rsvp.pasoDetallesTitulo)).toBeVisible();
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(invitada.getByText(copy.rsvp.pasoMensajeTitulo)).toBeVisible();
    await invitada.locator('input[name="cancion"]').fill(cancion);
    await invitada.locator('textarea[name="mensaje"]').fill(mensaje);
    await invitada.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(invitada.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    // Y aparece en la bandeja, con su grupo y como nuevo.
    await page.goto(RUTA_MENSAJES);
    const entrada = page.locator("li").filter({ hasText: mensaje });
    await expect(entrada).toBeVisible();
    await expect(entrada).toContainText(nombreGrupo);
    await expect(entrada.getByText(copy.panel.mensajes.nuevo)).toBeVisible();

    // Marcarlo como leído lo quita de la cuenta de nuevos.
    await entrada.getByRole("button", { name: copy.panel.mensajes.marcarLeido }).click();
    const yaLeido = page.locator("li").filter({ hasText: mensaje });
    await expect(yaLeido.getByText(copy.panel.mensajes.nuevo)).toHaveCount(0);
    await expect(
      yaLeido.getByRole("button", { name: copy.panel.mensajes.marcarNoLeido }),
    ).toBeVisible();

    // Y desde el mensaje se llega a la invitación que lo escribió.
    await yaLeido.getByRole("link", { name: copy.panel.mensajes.verGrupo }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombreGrupo);
  });

  test("la búsqueda encuentra por el texto del mensaje", async ({ page }) => {
    await entrar(page);
    await page.goto(`${RUTA_MENSAJES}?buscar=${encodeURIComponent("Mensaje de prueba")}`);
    await expect(page.getByText("(DES) Mensaje de prueba").first()).toBeVisible();

    await page.goto(`${RUTA_MENSAJES}?buscar=zzz-esto-no-existe`);
    await expect(page.getByText(copy.panel.mensajes.sinResultados)).toBeVisible();
  });

  /**
   * CASO DE ERROR. Se le pide a doscientas personas que sugieran canciones, así
   * que alguien va a sugerir una broma. Tiene que poder quitarse de la web sin
   * borrarla — y comprobarse en el HTML que recibe un invitado, no en el panel.
   */
  test("ocultar una canción la retira de la landing, y devolverla la trae", async ({
    page,
    request,
  }) => {
    await entrar(page);
    await page.goto(RUTA_MENSAJES);

    const fila = page.locator("li").filter({ hasText: "(DES) Canción de prueba" }).first();
    const texto = (await fila.locator("span").first().textContent())!.trim();

    // Antes de tocar nada, la canción está en la landing.
    const antes = await request.get("/");
    expect(await antes.text()).toContain(texto);

    await fila.getByRole("button", { name: copy.panel.mensajes.ocultar }).click();
    await expect(page.getByText(copy.panel.mensajes.cancionOcultada)).toBeVisible();

    // Y ya no está. Se mira el HTML entregado: que el panel diga que la ha
    // ocultado no prueba que el invitado deje de verla.
    const durante = await request.get("/");
    expect(await durante.text()).not.toContain(texto);

    // No se ha borrado: sigue en el panel, marcada como oculta.
    const ocultada = page.locator("li").filter({ hasText: texto }).first();
    await expect(ocultada).toContainText(copy.panel.mensajes.oculta);

    // Y se puede deshacer.
    await ocultada.getByRole("button", { name: copy.panel.mensajes.mostrar }).click();
    const despues = await request.get("/");
    expect(await despues.text()).toContain(texto);
  });

  test("se llega desde el menú del panel", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.mensajes }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_MENSAJES));
  });
});
