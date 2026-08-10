import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_RSVP } from "../../src/config/constants";

/**
 * BODA-27 · Apuntar una canción desde la portada
 *
 * LO QUE DE VERDAD SE PRUEBA AQUÍ ES QUIÉN PUEDE ESCRIBIR. La playlist es la
 * única escritura pública de la web además del RSVP, y la regla es que hace
 * falta una invitación: la lista que sonará esa noche es de los ciento veinte
 * invitados, no de quien pase por la web. Así que el primer test es el de
 * quien llega sin invitación, y comprueba que **no hay campo**, no que el
 * campo dé error.
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
        (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
      values (
        ${`(DES) Playlist ${sufijo}`}, 'ambos',
        array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
        public.huella_token(${token})
      )
      returning id
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
  });
  const pagina = await contexto.newPage();
  await pagina.goto(`${RUTA_RSVP}/${token}`);
  await pagina.close();
  return contexto;
}

test.describe("La playlist colaborativa", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: se comprueba lo que quedó escrito.");

  /**
   * CASO DE ERROR · Sin invitación no hay campo, y el token no se filtra.
   */
  test("quien llega sin invitación ve la explicación, no un campo roto", async ({
    browser,
  }) => {
    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    const html = await (await pagina.request.get("/")).text();

    // La sección está —si no, la comprobación no significaría nada—…
    expect(html).toContain(copy.playlist.titulo);
    // …y lo que hay es la explicación, no el campo.
    expect(html).toContain(copy.playlist.sinInvitacion);
    expect(html).not.toContain(copy.playlist.campoCancion);

    await pagina.goto("/");
    await expect(
      pagina.locator("#playlist").getByRole("button", { name: copy.playlist.anadir }),
    ).toHaveCount(0);

    await contexto.close();
  });

  /**
   * CAMINO FELIZ · Con la invitación abierta, y sin JavaScript.
   */
  test("con la invitación abierta se apunta una canción, sin JavaScript", async ({
    browser,
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
