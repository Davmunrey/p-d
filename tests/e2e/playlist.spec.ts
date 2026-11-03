import { expect, test, type Browser, type BrowserContext } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_INVITACION } from "../../src/config/constants";

/**
 * BODA-27 · Apuntar una canción desde la portada
 *
 * LO QUE DE VERDAD SE PRUEBA AQUÍ ES QUIÉN PUEDE ESCRIBIR. La playlist es la
 * única escritura pública de la web además del RSVP, y la regla es que hace
 * falta una invitación: la lista que sonará esa noche es de los ciento veinte
 * invitados, no de quien pase por la web. Así que el primer test es el de
 * quien llega sin invitación, y comprueba que **la sección no está**: ni el
 * campo ni las canciones de los demás.
 *
 * Y SE COMPRUEBA CONTRA LA BASE, no contra la pantalla. Una sección que dice
 * «apuntada» y no escribe nada pasaría cualquier test que sólo mire el HTML —
 * y el fallo se vería el día de la boda, cuando el DJ pida la lista.
 *
 * SIN JAVASCRIPT EL CAMINO FELIZ. Es una acción de servidor dentro de un
 * `<form>`, así que tiene que funcionar igual con el JavaScript apagado: quien
 * abre esto lo hace desde el móvil, en el pueblo donde es la boda.
 */

const cadena = process.env.DATABASE_URL;

/**
 * Cada contexto con su propio origen: `sugerir_cancion()` pasa por
 * `exigir_cupo_rsvp()`, que cuenta intentos por IP, y toda la suite sale de
 * `127.0.0.1`. Sin esto, los tests que prueban enlaces inválidos cierran el
 * cupo a los demás. Es el mismo remedio que en `rsvp.spec.ts`.
 */
let contador = 0;
const origenPropio = () => ({
  // Bloque propio: `198.51.100.x` ya se lo reparten `rsvp` y el del acuse de
  // recibo, y el cortafuegos cuenta por IP. Compartirlo funcionaría hasta el
  // día en que uno de los tres gaste diez intentos.
  "x-forwarded-for": `203.0.113.${((contador += 1) % 100) + 100}`,
});

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Un grupo nuevo por test: así ninguno depende del orden ni del seed.
 *
 * SE BORRA EL DE LA VEZ ANTERIOR ANTES DE CREARLO. El token es fijo —tiene que
 * serlo para poder abrir la misma invitación— y `huella_token` es única, así
 * que la segunda ejecución de la suite chocaba contra la primera. Un test que
 * sólo pasa con la base recién hecha es un test que no se puede repetir, y en
 * local la base se reutiliza.
 *
 * Las canciones se borran ANTES que el grupo y a propósito: la clave ajena es
 * `on delete set null` —una sugerencia no se pierde porque su grupo
 * desaparezca— así que borrar el grupo primero las dejaría huérfanas y
 * visibles en la playlist de verdad, ejecución tras ejecución.
 */
async function crearGrupo(sufijo: string): Promise<{ token: string; grupoId: string }> {
  const token = `desarrollo-playlist-${sufijo}-000000`;
  const grupoId = await conBase(async (sql) => {
    await sql`
      delete from public.canciones_sugeridas
       where grupo_id in (
         select id from public.grupos_invitacion
          where huella_token = public.huella_token(${token})
       )
    `;
    await sql`
      delete from public.grupos_invitacion where huella_token = public.huella_token(${token})
    `;
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion
        (nombre, lado, maximo_acompanantes, huella_token)
      values (
        ${`(DES) Playlist ${sufijo}`}, 'ambos', 0,
        public.huella_token(${token})
      )
      returning id
    `;
    // Con alguien dentro: un grupo vacío todavía no es de nadie y su enlace no
    // se recuerda.
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos)
      values (${grupo.id}, ${`(DES) Playlist ${sufijo}`}, '(DES)')
    `;
    return grupo.id;
  });
  return { token, grupoId };
}

/**
 * Abre la invitación para que el navegador se quede con ella, que es lo que
 * habilita el campo de la portada. No se inyecta la cookie a mano a propósito:
 * lo que hay que probar es que **abrir el enlace** basta.
 */
async function conInvitacionAbierta(
  browser: Browser,
  token: string,
  javaScriptEnabled = true,
): Promise<BrowserContext> {
  const contexto = await browser.newContext({
    javaScriptEnabled,
    locale: "es-ES",
    extraHTTPHeaders: origenPropio(),
    reducedMotion: "reduce",
  });
  const pagina = await contexto.newPage();
  await pagina.goto(`${RUTA_INVITACION}/${token}`);
  await pagina.close();
  return contexto;
}

test.describe("La playlist colaborativa", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: se comprueba lo que quedó escrito.");

  /**
   * CASO DE ERROR · Sin invitación no hay playlist.
   *
   * La sección es de los invitados: quien llega a la web sin su enlace no ve
   * el campo ni las canciones apuntadas. Se mira el HTML del servidor, que es
   * lo que también ve quien no tiene JavaScript, y la página ya pintada.
   */
  test("quien llega sin invitación no ve la playlist", async ({ browser }) => {
    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    const html = await (await pagina.request.get("/")).text();
    // La portada sí llega —si no, la comprobación no significaría nada—…
    expect(html).toContain(copy.portada.etiquetaFecha);
    // …pero de la playlist, nada.
    expect(html).not.toContain(copy.playlist.titulo);
    expect(html).not.toContain(copy.playlist.campoCancion);

    await pagina.goto("/");
    await expect(pagina.locator("#portada")).toBeVisible();
    await expect(pagina.locator("#playlist")).toHaveCount(0);

    await contexto.close();
  });

  /**
   * CASO DE ERROR · Un enlace que no existe no se recuerda.
   *
   * La portada lo comprueba contra la base al pintarse y, si no vale, pide que
   * se olvide —con una imagen, así que también sin JavaScript, como aquí—: un
   * enlace mal tecleado lleva a la portada de todos, sin playlist.
   */
  test("un enlace que no existe no se recuerda", async ({ browser }) => {
    const contexto = await conInvitacionAbierta(browser, "no-existe-000000", false);
    expect(
      (await contexto.cookies()).find((c) => c.name === "boda:invitacion"),
    ).toBeUndefined();

    const html = await (await contexto.request.get("/")).text();
    expect(html).toContain(copy.portada.etiquetaFecha);
    expect(html).not.toContain(copy.playlist.titulo);
    await contexto.close();
  });

  /**
   * CASO DE ERROR · Un enlace que se anula con la página abierta se olvida al fallar.
   *
   * Los novios borran la invitación —o emiten un enlace nuevo— mientras la
   * familia tiene la portada abierta, con el campo a la vista. Al apuntar, la
   * base dice que no vale y la acción borra la cookie: la respuesta ya es la
   * portada de todos, sin playlist, y la canción no se ha escrito.
   */
  test("un enlace anulado deja de recordarse en cuanto falla", async ({ browser }) => {
    const { token, grupoId } = await crearGrupo("anulado");
    const contexto = await conInvitacionAbierta(browser, token, false);
    const pagina = await contexto.newPage();
    await pagina.goto("/#playlist");
    await expect(
      pagina.locator("#playlist").getByLabel(copy.playlist.campoCancion),
    ).toBeVisible();

    // El token no se puede cambiar a mano (RSV06, lo congela un trigger): se
    // anula como lo anula de verdad borrar la invitación desde el panel.
    await conBase((sql) => sql`delete from public.grupos_invitacion where id = ${grupoId}`);

    await pagina
      .locator("#playlist")
      .getByLabel(copy.playlist.campoCancion)
      .fill("(DES) Sonda");
    await pagina
      .locator("#playlist")
      .getByRole("button", { name: copy.playlist.anadir })
      .click();
    // Sin JavaScript, la misma respuesta ya sale sin la sección.
    await expect(pagina.locator("#portada")).toBeVisible();
    await expect(pagina.locator("#playlist")).toHaveCount(0);
    const escritas = await conBase(
      (sql) =>
        sql`select count(*)::int as n from public.canciones_sugeridas where texto = '(DES) Sonda'`,
    );
    expect(escritas[0].n).toBe(0);

    expect(
      (await contexto.cookies()).find((c) => c.name === "boda:invitacion"),
    ).toBeUndefined();
    await contexto.close();
  });

  /**
   * CASO DE ERROR · Al volver con un enlace ya anulado, no hay playlist.
   *
   * La portada pregunta a la base al pintarse —para saludar—, así que ya sabe
   * que el enlace no vale: no enseña una sección que va a fallar, y pide que
   * se olvide la cookie. Sin JavaScript también: lo pide una imagen.
   */
  test("al volver con un enlace anulado no hay playlist, y se olvida", async ({ browser }) => {
    const { token, grupoId } = await crearGrupo("anulado-vuelta");
    const contexto = await conInvitacionAbierta(browser, token, false);
    await conBase((sql) => sql`delete from public.grupos_invitacion where id = ${grupoId}`);

    const pagina = await contexto.newPage();
    await pagina.goto("/");
    await expect(pagina.locator("#portada")).toBeVisible();
    await expect(pagina.locator("#playlist")).toHaveCount(0);
    expect(
      (await contexto.cookies()).find((c) => c.name === "boda:invitacion"),
    ).toBeUndefined();
    await contexto.close();
  });

  /**
   * CAMINO FELIZ · Con la invitación abierta, y sin JavaScript.
   */
  test("con la invitación abierta se apunta una canción, sin JavaScript", async ({
    browser,
    page,
  }) => {
    const { token, grupoId } = await crearGrupo("feliz");
    const contexto = await conInvitacionAbierta(browser, token, false);
    const pagina = await contexto.newPage();

    // Fijo y no con la hora dentro: `crearGrupo` limpia las canciones de este
    // grupo al empezar, así que repetir la suite no va dejando sugerencias
    // sueltas en la playlist que sí se enseña.
    const cancion = "(DES) Que nos sigan las luces — Sidonie";

    await pagina.goto("/");
    const seccion = pagina.locator("#playlist");
    await seccion.getByLabel(copy.playlist.campoCancion).fill(cancion);
    await seccion.getByRole("button", { name: copy.playlist.anadir }).click();

    // Lo que ve quien la ha apuntado: su canción, ya en la lista.
    await expect(pagina.locator("#playlist").getByText(cancion)).toBeVisible();

    // Y entra con el pop elástico de la entrega (BODA-120): la curva con
    // muelle, cubic-bezier(.2, 1.3, .4, 1), que sobrepasa el 1. Se mira desde
    // una pestaña normal —el contexto de arriba reduce el movimiento—, que
    // también entra con el enlace: sin él no hay playlist.
    await page.goto(`${RUTA_INVITACION}/${token}`);
    const ficha = await page
      .locator("#playlist ul > li")
      .filter({ hasText: cancion })
      .evaluate((nodo) => ({
        nombre: getComputedStyle(nodo).animationName,
        curva: getComputedStyle(nodo).animationTimingFunction,
      }));
    expect(ficha.nombre).toBe("pop");
    expect(ficha.curva).toBe("cubic-bezier(0.2, 1.3, 0.4, 1)");

    // Y lo que importa de verdad: que esté escrita, y atribuida a su grupo.
    const [fila] = await conBase(
      (sql) => sql<{ grupo_id: string }[]>`
        select grupo_id from public.canciones_sugeridas where texto = ${cancion}
      `,
    );
    expect(fila?.grupo_id, "la canción tiene que quedar guardada con su grupo").toBe(grupoId);

    await contexto.close();
  });

  /**
   * EL TOKEN NO PUEDE ESTAR EN LA PORTADA.
   *
   * Es la contrapartida de haberlo guardado en una cookie: si además viajara
   * en un campo oculto, estaría en el código fuente de una página pública y en
   * el historial del móvil. Ese token abre los datos de una familia entera.
   */
  test("el enlace de invitación no viaja en el HTML de la portada", async ({ browser }) => {
    const { token } = await crearGrupo("token");
    const contexto = await conInvitacionAbierta(browser, token);
    const pagina = await contexto.newPage();

    const html = await (await pagina.request.get("/")).text();

    // El campo sí está: el navegador recuerda la invitación.
    expect(html).toContain(copy.playlist.campoCancion);
    // El token no, ni entero ni en un `value`.
    expect(html, "el token no puede aparecer en la portada").not.toContain(token);

    // Y la cookie que lo lleva no la puede leer el JavaScript de la página.
    const galleta = (await contexto.cookies()).find((c) => c.name === "boda:invitacion");
    expect(galleta?.httpOnly, "la cookie de la invitación tiene que ser httpOnly").toBe(true);

    await contexto.close();
  });

  /**
   * CASO DE ERROR · El tope de diez por grupo se cuenta en la base y se cuenta
   * aquí. Se llenan las diez por SQL —lo que se prueba es la número once, no
   * escribir diez veces en un formulario.
   */
  test("pasado el tope del grupo se explica, y no se escribe nada más", async ({ browser }) => {
    const { token, grupoId } = await crearGrupo("tope");
    await conBase(async (sql) => {
      for (let i = 0; i < 10; i += 1) {
        await sql`
          insert into public.canciones_sugeridas (texto, grupo_id)
          values (${`(DES) Relleno ${i} ${grupoId.slice(0, 8)}`}, ${grupoId})
        `;
      }
    });

    const contexto = await conInvitacionAbierta(browser, token);
    const pagina = await contexto.newPage();

    await pagina.goto("/");
    const seccion = pagina.locator("#playlist");
    await seccion.getByLabel(copy.playlist.campoCancion).fill("(DES) La once no cabe");
    await seccion.getByRole("button", { name: copy.playlist.anadir }).click();

    await expect(seccion.getByText(copy.playlist.errorTope)).toBeVisible();

    const [cuenta] = await conBase(
      (sql) => sql<{ total: number }[]>`
        select count(*)::int as total
          from public.canciones_sugeridas where grupo_id = ${grupoId}
      `,
    );
    expect(cuenta.total, "el tope es del lado de la base, no sólo del mensaje").toBe(10);

    await contexto.close();
  });
});
