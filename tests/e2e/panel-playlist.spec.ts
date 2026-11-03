import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { borrarInvitadosDePrueba, entrarComoInvitado } from "./utiles/invitacion-de-prueba";
import {
  RUTA_ACCESO,
  RUTA_PANEL,
  RUTA_PLAYLIST,
  RUTA_PLAYLIST_EXPORTAR,
  TOPE_CANCIONES_POR_GRUPO,
} from "../../src/config/constants";

/**
 * BODA-113 · Las canciones que piden los invitados
 *
 * Las apuntan desde la playlist de la portada quienes entran con el enlace de
 * su invitación. Lo que se comprueba es que **cierra el círculo**: alguien
 * pide una canción de broma y se puede retirar de la web sin borrarla, y la
 * lista para el DJ trae sólo lo que se ve.
 *
 * El caso de error de la playlist se prueba donde importa —en el HTML que
 * recibe un invitado— y no mirando la pantalla del panel: una canción que
 * sigue en la landing después de ocultarla es el único fallo que de verdad
 * cuenta.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

const MARCA = "(DES) E2E Playlist";

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

test.describe("La playlist del panel", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /**
   * El formulario de confirmación ya no pide mensaje: el apartado del menú es
   * «Playlist» y lleva directo a las canciones.
   */
  test("se llega desde el menú del panel, que la nombra", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.playlist, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_PLAYLIST}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.panel.playlist.playlistTitulo,
    );
  });

  /** CASO DE ERROR · un marcador viejo de «Mensajes» no acaba en un 404. */
  test("la dirección vieja de los mensajes lleva a la playlist", async ({ page }) => {
    await entrar(page);
    await page.goto("/panel/mensajes");
    await expect(page).toHaveURL(new RegExp(`${RUTA_PLAYLIST}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.panel.playlist.playlistTitulo,
    );
  });

  /**
   * CASO DE ERROR. Se le pide a doscientas personas que sugieran canciones, así
   * que alguien va a sugerir una broma. Tiene que poder quitarse de la web sin
   * borrarla — y comprobarse en el HTML que recibe un invitado, no en el panel.
   */
  test("ocultar una canción la retira de la landing, y devolverla la trae", async ({
    page,
  }) => {
    // Una canción propia, a la vista en la web: no se depende de lo que otros
    // tests hayan dejado en la playlist.
    const texto = `${MARCA} Broma ${Date.now()}`;
    await conBase(
      (sql) =>
        sql`insert into public.canciones_sugeridas (texto, aprobada) values (${texto}, true)`,
    );

    await entrar(page);
    /*
      LA PLAYLIST SÓLO SALE A QUIEN ENTRA CON SU ENLACE, así que la landing se
      pide como invitado: la misma pestaña abre una invitación de prueba, y
      `page.request` lleva su cookie.
    */
    await entrarComoInvitado(page, "panel-playlist");
    await page.goto(RUTA_PLAYLIST);

    const fila = page.locator("li").filter({ hasText: texto }).first();
    await expect(fila).toBeVisible();

    // Antes de tocar nada, la canción está en la landing.
    const antes = await page.request.get("/");
    expect(await antes.text()).toContain(texto);

    await fila.getByRole("button", { name: copy.panel.playlist.ocultar }).click();
    await expect(page.getByText(copy.panel.playlist.cancionOcultada)).toBeVisible();
    // Y vuelve a la playlist, con su aviso.
    await expect(page).toHaveURL(new RegExp(`${RUTA_PLAYLIST}\\?estado=cancion-ocultada`));

    // Y ya no está. Se mira el HTML entregado: que el panel diga que la ha
    // ocultado no prueba que el invitado deje de verla.
    const durante = await page.request.get("/");
    expect(await durante.text()).not.toContain(texto);

    // No se ha borrado: sigue en el panel, marcada como oculta.
    const ocultada = page.locator("li").filter({ hasText: texto }).first();
    await expect(ocultada).toContainText(copy.panel.playlist.oculta);

    /*
      Y se puede deshacer.

      SE ESPERA AL AVISO ANTES DE PEDIR LA LANDING, igual que al ocultarla.
      `click()` vuelve en cuanto suelta el clic, no cuando la acción de servidor
      ha terminado: sin esta espera se pedía el HTML mientras la canción seguía
      oculta y el test fallaba contando una carrera como si fuera un fallo del
      producto. Lo delató el HTML recibido — traía la canción del intento
      anterior y no la de éste, que es la firma de una lectura adelantada.
    */
    await ocultada.getByRole("button", { name: copy.panel.playlist.mostrar }).click();
    await expect(page.getByText(copy.panel.playlist.cancionMostrada)).toBeVisible();

    const despues = await page.request.get("/");
    expect(await despues.text()).toContain(texto);

    await conBase((sql) => sql`delete from public.canciones_sugeridas where texto = ${texto}`);
    await borrarInvitadosDePrueba();
  });

  /**
   * CASO DE ERROR · la canción se fue mientras la playlist estaba abierta.
   *
   * Pasa de verdad: alguien la borra o la base la retira mientras la pantalla
   * está abierta. Pulsar sobre ella decía «sólo un editor puede», que es falso
   * para quien lo es y le hace buscar un problema de permisos que no hay.
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
    await page.goto(RUTA_PLAYLIST);
    const fila = page.locator("li").filter({ hasText: texto }).first();
    await expect(fila).toBeVisible();

    await conBase(
      (sql) => sql`delete from public.canciones_sugeridas where id = ${cancion.id}`,
    );
    await fila.getByRole("button", { name: copy.panel.playlist.ocultar }).click();

    await expect(page.getByText(copy.panel.playlist.errorNoExiste)).toBeVisible();
    await expect(page.getByText(copy.panel.playlist.errorSinPermiso)).toHaveCount(0);
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
      // Otra familia pide la primera con otras mayúsculas: en el fichero, una vez.
      const [otro] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre) values (${`${MARCA} Otra familia ${sello}`}) returning id
      `;
      await sql`
        insert into public.canciones_sugeridas (texto, grupo_id, creado_en, aprobada)
        values (${primera.toUpperCase()}, ${otro.id}, now() - interval '1 minute', true)
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
      expect(
        lineas.filter((linea) => linea.toLowerCase() === primera.toLowerCase()),
        "la misma canción pedida por dos familias sale una vez",
      ).toEqual([primera]);

      // Y en la pantalla, cuántas lleva el grupo: las diez, ocultas incluidas,
      // que es como las cuenta la base.
      await page.goto(RUTA_PLAYLIST);
      await page.getByText(copy.panel.playlist.porGrupoTitulo).click();
      const fila = page.locator("details li").filter({ hasText: grupo });
      await expect(fila).toContainText(
        copy.panel.playlist.porGrupoFila
          .replace("{cuantas}", String(TOPE_CANCIONES_POR_GRUPO))
          .replace("{tope}", String(TOPE_CANCIONES_POR_GRUPO)),
      );
      await expect(fila).toContainText(copy.panel.playlist.enElTope);
    } finally {
      await conBase(async (sql) => {
        await sql`delete from public.canciones_sugeridas where texto ilike ${`${MARCA}%${sello}`}`;
        await sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%${sello}`}`;
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
});
