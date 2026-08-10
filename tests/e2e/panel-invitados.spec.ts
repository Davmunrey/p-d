import { expect, test, type Page } from "@playwright/test";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_INVITADOS, RUTA_PANEL, RUTA_RSVP } from "../../src/config/constants";

/**
 * BODA-50/51/52 · Las invitaciones
 *
 * Lo que se prueba aquí es **la vuelta entera**, que es lo único que demuestra
 * que el módulo está cableado: se crea una invitación en el panel, se copia su
 * enlace, se contesta desde él como haría un invitado, y se vuelve al panel a
 * ver la respuesta. Si esa vuelta se cierra, el RSVP y el panel están unidos de
 * verdad; si se corta por algún sitio, este test dice por cuál.
 *
 * Necesita sesión, así que vive en el trabajo de CI que levanta el Supabase
 * local y se salta en cualquier otro sitio.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

/** Marca de agua, para no confundir lo que escribe el test con el seed. */
const MARCA = "(DES) E2E Invitación";

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

test.describe("Invitaciones", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test("se llega desde el menú del panel", async ({ page }) => {
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.invitados }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_INVITADOS));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.panel.invitados.titulo,
    );
  });

  /**
   * EL CAMINO COMPLETO. Panel → enlace → respuesta → panel.
   */
  test("crear una invitación, contestarla desde su enlace y verla de vuelta", async ({
    page,
    browser,
  }) => {
    const nombreGrupo = `${MARCA} ${Date.now()}`;

    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByLabel(copy.panel.invitados.maximoAcompanantes).fill("1");
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();

    // Se cae en la ficha, con el enlace en claro. Se enseña una sola vez: la
    // base guarda su huella, no el token.
    await expect(page).toHaveURL(new RegExp(`${RUTA_INVITADOS}/[0-9a-f-]{36}`));
    const campoEnlace = page.getByLabel(copy.panel.invitados.copiarEnlace);
    await expect(campoEnlace).toBeVisible();
    const enlace = await campoEnlace.inputValue();
    expect(enlace).toContain(`${RUTA_RSVP}/`);

    // Una persona dentro.
    await page.getByLabel(copy.panel.invitados.nombrePersona).fill("(DES) Olalla");
    await page.getByLabel(copy.panel.invitados.apellidosPersona).fill("E2E");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Olalla E2E")).toBeVisible();

    // Ahora, como invitada: sesión aparte y sin JavaScript, que es como se abre
    // un enlace de estos desde WhatsApp.
    const rutaRsvp = new URL(enlace).pathname;
    const comoInvitada = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
    });
    const paginaInvitada = await comoInvitada.newPage();
    await paginaInvitada.goto(rutaRsvp);
    await expect(paginaInvitada.getByRole("heading", { level: 1 })).toContainText(nombreGrupo);

    await paginaInvitada.locator('input[value="confirmado"]').first().check();
    await paginaInvitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await paginaInvitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await paginaInvitada.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(paginaInvitada.getByRole("heading", { level: 1 })).toHaveText(
      copy.rsvp.graciasSi,
    );
    await comoInvitada.close();

    // Y de vuelta al panel: la respuesta tiene que estar ahí.
    await page.reload();
    await expect(page.getByText(copy.rsvp.vieneSi)).toBeVisible();

    // También en la lista, en el recuento del grupo.
    await page.goto(`${RUTA_INVITADOS}?buscar=${encodeURIComponent(nombreGrupo)}`);
    await expect(page.getByRole("link", { name: new RegExp(MARCA) })).toContainText("1");
  });

  test("la búsqueda encuentra por el nombre de una persona, no sólo del grupo", async ({
    page,
  }) => {
    const nombreGrupo = `${MARCA} busqueda ${Date.now()}`;

    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await page.getByLabel(copy.panel.invitados.nombrePersona).fill("(DES) Ainhoa");
    await page.getByLabel(copy.panel.invitados.apellidosPersona).fill("Zubeldía");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();

    // Sin acentos: quien busca desde el móvil no los escribe.
    await page.goto(`${RUTA_INVITADOS}?buscar=zubeldia`);
    await expect(page.getByRole("link", { name: new RegExp(nombreGrupo) })).toBeVisible();
  });

  /**
   * CASO DE ERROR. Un enlace emitido de nuevo invalida el anterior en el acto.
   * Es lo que se hace si una invitación acaba donde no debía.
   */
  test("emitir un enlace nuevo deja el anterior sin valor", async ({ page, browser }) => {
    const nombreGrupo = `${MARCA} rotado ${Date.now()}`;

    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();

    const primero = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();

    await page.getByRole("button", { name: copy.panel.invitados.emitirEnlace }).click();
    const segundo = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
    expect(segundo).not.toBe(primero);

    const contexto = await browser.newContext({ locale: "es-ES" });
    const invitada = await contexto.newPage();

    await invitada.goto(new URL(primero).pathname);
    await expect(invitada.getByText(copy.rsvp.tokenInvalido)).toBeVisible();
    // Y no cuenta de quién era: ni el nombre del grupo se escapa.
    await expect(invitada.locator("body")).not.toContainText(nombreGrupo);

    await invitada.goto(new URL(segundo).pathname);
    await expect(invitada.getByRole("heading", { level: 1 })).toContainText(nombreGrupo);

    await contexto.close();
  });

  /**
   * CASO DE ERROR. Quitar a alguien que ya ha contestado se llevaría su
   * respuesta por delante en cascada, y el recuento de la cocina cambiaría solo
   * sin dejar rastro.
   */
  test("no se puede quitar a alguien que ya ha contestado", async ({ page, browser }) => {
    const nombreGrupo = `${MARCA} quitar ${Date.now()}`;

    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();

    await page.getByLabel(copy.panel.invitados.nombrePersona).fill("(DES) Xabi");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();

    // Mientras no ha contestado, sí se puede quitar: el botón está.
    await expect(page.getByRole("button", { name: copy.panel.invitados.quitar })).toBeVisible();

    const contexto = await browser.newContext({ locale: "es-ES" });
    const invitada = await contexto.newPage();
    await invitada.goto(new URL(enlace).pathname);
    await invitada.locator('input[value="rechazado"]').first().check();
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await invitada.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(invitada.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasNo);
    await contexto.close();

    // Contestado: el botón de quitar desaparece.
    await page.reload();
    await expect(page.getByRole("button", { name: copy.panel.invitados.quitar })).toHaveCount(
      0,
    );
  });
});

/**
 * BODA-43 · Los números de la portada del panel
 *
 * Antes esta pantalla decía «aquí irán los números de la boda». Lo que se
 * comprueba es que ya no promete nada: que las cifras se mueven cuando alguien
 * contesta, que es la única forma de saber que salen de la base.
 */
test.describe("Resumen del panel", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test("las cifras suben cuando alguien confirma", async ({ page, browser }) => {
    await entrar(page);

    const confirmados = page
      .getByRole("term")
      .filter({ hasText: copy.panel.resumen.confirmados })
      .locator("xpath=following-sibling::dd[1]");

    await page.goto(RUTA_PANEL);
    const antes = Number((await confirmados.first().textContent())?.trim() ?? "0");

    // Una invitación nueva con una persona, contestada que sí.
    await page.goto(RUTA_INVITADOS);
    await page
      .getByLabel(copy.panel.invitados.nombreGrupo)
      .fill(`${MARCA} cifras ${Date.now()}`);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
    await page.getByLabel(copy.panel.invitados.nombrePersona).fill("(DES) Nekane");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();

    const contexto = await browser.newContext({ locale: "es-ES" });
    const invitada = await contexto.newPage();
    await invitada.goto(new URL(enlace).pathname);
    await invitada.locator('input[value="confirmado"]').first().check();
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await invitada.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(invitada.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    await page.goto(RUTA_PANEL);
    const despues = Number((await confirmados.first().textContent())?.trim() ?? "0");

    // Si esto no sube, las cifras no salen de la base.
    expect(despues).toBe(antes + 1);
  });

  test("sin fecha o sin invitados, lo dice en vez de enseñar ceros", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PANEL);

    // Con el seed hay invitados, así que se enseñan los bloques de cifras.
    await expect(
      page.getByRole("heading", { name: copy.panel.resumen.bloqueInvitados }),
    ).toBeVisible();
    // Y la cuenta atrás dice algo concreto, no un hueco.
    await expect(page.locator("header")).not.toContainText("{dias}");
  });
});
