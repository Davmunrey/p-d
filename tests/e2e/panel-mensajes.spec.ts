import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_MENSAJES,
  RUTA_PANEL,
  RUTA_PLAYLIST_EXPORTAR,
  TOPE_CANCIONES_POR_GRUPO,
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

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

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

    /*
      Y se puede deshacer.

      SE ESPERA AL AVISO ANTES DE PEDIR LA LANDING, igual que al ocultarla.
      `click()` vuelve en cuanto suelta el clic, no cuando la acción de servidor
      ha terminado: sin esta espera se pedía el HTML mientras la canción seguía
      oculta y el test fallaba contando una carrera como si fuera un fallo del
      producto. Lo delató el HTML recibido — traía la canción del intento
      anterior y no la de éste, que es la firma de una lectura adelantada.
    */
    await ocultada.getByRole("button", { name: copy.panel.mensajes.mostrar }).click();
    await expect(page.getByText(copy.panel.mensajes.cancionMostrada)).toBeVisible();

    const despues = await request.get("/");
    expect(await despues.text()).toContain(texto);
  });

  /**
   * CASO DE ERROR · la canción se fue mientras la bandeja estaba abierta.
   *
   * Pasa de verdad: el invitado corrige su canción al cambiar la respuesta y
   * la vieja se retira. Pulsar sobre ella decía «sólo un editor puede», que es
   * falso para quien lo es y le hace buscar un problema de permisos que no hay.
   */
  test("moderar una canción que ya no está lo dice, sin culpar al permiso", async ({
    page,
  }) => {
    const texto = `${MARCA} Se va ${Date.now()}`;
    const [cancion] = await conBase(
      (sql) => sql<{ id: string }[]>`
        insert into public.canciones_sugeridas (texto) values (${texto}) returning id
      `,
    );

    await entrar(page);
    await page.goto(RUTA_MENSAJES);
    const fila = page.locator("li").filter({ hasText: texto }).first();
    await expect(fila).toBeVisible();

    await conBase(
      (sql) => sql`delete from public.canciones_sugeridas where id = ${cancion.id}`,
    );
    await fila.getByRole("button", { name: copy.panel.mensajes.ocultar }).click();

    await expect(page.getByText(copy.panel.mensajes.errorNoExiste)).toBeVisible();
    await expect(page.getByText(copy.panel.mensajes.errorSinPermiso)).toHaveCount(0);
  });

  /**
   * BODA-113 · LA LISTA PARA EL DJ y la cuenta por grupo contra el tope.
   *
   * El fichero lleva sólo lo que se ve en la web y en el orden en que llegó:
   * una canción oculta no puede volver a sonar por la puerta de atrás.
   */
  test("la lista para el DJ trae lo que se ve, en orden, y se cuenta cada grupo", async ({
    page,
  }) => {
    const sello = Date.now();
    const grupo = `${MARCA} Melómanos ${sello}`;
    const primera = `${MARCA} Primera ${sello}`;
    const segunda = `${MARCA} Segunda ${sello}`;
    const oculta = `${MARCA} Oculta ${sello}`;
    await conBase(async (sql) => {
      const [g] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre) values (${grupo}) returning id
      `;
      // Diez del mismo grupo: el tope. Las tres que se miran, las primeras.
      await sql`
        insert into public.canciones_sugeridas (texto, grupo_id, creado_en, aprobada)
        values (${primera}, ${g.id}, now() - interval '3 minutes', true),
               (${segunda}, ${g.id}, now() - interval '2 minutes', true),
               (${oculta}, ${g.id}, now() - interval '1 minute', false)
      `;
      for (let i = 0; i < TOPE_CANCIONES_POR_GRUPO - 3; i += 1) {
        await sql`
          insert into public.canciones_sugeridas (texto, grupo_id)
          values (${`${MARCA} Relleno ${i} ${sello}`}, ${g.id})
        `;
      }
    });

    try {
      await entrar(page);
      const fichero = await page.request.get(RUTA_PLAYLIST_EXPORTAR);
      expect(fichero.status()).toBe(200);
      expect(fichero.headers()["content-disposition"]).toContain("attachment");
      const lineas = (await fichero.text()).split("\r\n");
      expect(lineas).toContain(primera);
      expect(lineas.indexOf(primera)).toBeLessThan(lineas.indexOf(segunda));
      expect(lineas).not.toContain(oculta);

      // Y en la pantalla, cuántas lleva el grupo: las diez, ocultas incluidas,
      // que es como las cuenta la base.
      await page.goto(RUTA_MENSAJES);
      await page.getByText(copy.panel.mensajes.porGrupoTitulo).click();
      const fila = page.locator("details li").filter({ hasText: grupo });
      await expect(fila).toContainText(
        copy.panel.mensajes.porGrupoFila
          .replace("{cuantas}", String(TOPE_CANCIONES_POR_GRUPO))
          .replace("{tope}", String(TOPE_CANCIONES_POR_GRUPO)),
      );
      await expect(fila).toContainText(copy.panel.mensajes.enElTope);
    } finally {
      await conBase(async (sql) => {
        await sql`delete from public.canciones_sugeridas where texto like ${`${MARCA}%${sello}`}`;
        await sql`delete from public.grupos_invitacion where nombre = ${grupo}`;
      });
    }
  });

  /** CASO DE ERROR · sin sesión, la lista no se descarga. */
  test("sin sesión, la lista para el DJ no se descarga", async ({ browser }) => {
    const contexto = await browser.newContext({ locale: "es-ES" });
    const respuesta = await contexto.request.get(RUTA_PLAYLIST_EXPORTAR, { maxRedirects: 0 });
    expect(respuesta.status()).toBeGreaterThanOrEqual(300);
    expect(respuesta.status()).toBeLessThan(400);
    expect(respuesta.headers()["location"]).toContain(RUTA_ACCESO);
    await contexto.close();
  });

  test("se llega desde el menú del panel", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.mensajes }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_MENSAJES));
  });
});
