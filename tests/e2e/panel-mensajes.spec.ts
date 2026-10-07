import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_MENSAJES,
  RUTA_PANEL,
  RUTA_PLAYLIST,
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
    await page.goto(RUTA_PLAYLIST);

    const fila = page.locator("li").filter({ hasText: "(DES) Canción de prueba" }).first();
    const texto = (await fila.locator("span").first().textContent())!.trim();

    // Antes de tocar nada, la canción está en la landing.
    const antes = await request.get("/");
    expect(await antes.text()).toContain(texto);

    await fila.getByRole("button", { name: copy.panel.mensajes.ocultar }).click();
    await expect(page.getByText(copy.panel.mensajes.cancionOcultada)).toBeVisible();
    // Y vuelve a su pestaña, no a la de los mensajes.
    await expect(page).toHaveURL(new RegExp(`${RUTA_PLAYLIST}\\?estado=cancion-ocultada`));

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
    await page.goto(RUTA_PLAYLIST);
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
   * BODA-112 · DESTACAR LO PRÁCTICO. Entre treinta «¡qué ganas!» llega un «la
   * abuela es celíaca», y no puede perderse al marcarlo como leído.
   */
  test("destacar un mensaje lo deja a la vista y el filtro de destacados lo encuentra", async ({
    page,
  }) => {
    const sello = Date.now();
    const grupo = `${MARCA} Destacar ${sello}`;
    const practico = `(DES) La abuela es celíaca ${sello}`;
    const saludo = `(DES) Qué ganas ${sello}`;
    const [confirmacion] = await conBase(async (sql) => {
      const [g] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre) values (${grupo}) returning id
      `;
      const ids: string[] = [];
      for (const [nombre, mensaje] of [
        ["(DES) Abuela", practico],
        ["(DES) Nieto", saludo],
      ]) {
        const [persona] = await sql<{ id: string }[]>`
          insert into public.invitados (grupo_id, nombre) values (${g.id}, ${nombre}) returning id
        `;
        const [c] = await sql<{ id: string }[]>`
          insert into public.confirmaciones
            (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento, mensaje)
          values (${persona.id}, 'confirmado', 'publico', false, false, ${mensaje})
          returning id
        `;
        ids.push(c.id);
      }
      return ids;
    });

    try {
      await entrar(page);
      await page.goto(RUTA_MENSAJES);
      const entrada = page.locator("li").filter({ hasText: practico });
      await entrada.getByRole("button", { name: copy.panel.mensajes.destacar }).click();
      await expect(page.getByText(copy.panel.mensajes.avisoDestacado)).toBeVisible();
      await expect(
        page
          .locator("li")
          .filter({ hasText: practico })
          .getByText(copy.panel.mensajes.destacado, { exact: true }),
      ).toBeVisible();

      // Escrito en la base, no sólo en la pantalla.
      const marcas = await conBase(
        (sql) => sql`
          select 1 from public.mensajes_destacados where confirmacion_id = ${confirmacion}
        `,
      );
      expect(marcas).toHaveLength(1);

      // Sólo los destacados: el práctico sí, el saludo del mismo grupo no.
      await page.goto(
        `${RUTA_MENSAJES}?destacados=1&buscar=${encodeURIComponent(String(sello))}`,
      );
      await expect(page.getByText(practico)).toBeVisible();
      await expect(page.getByText(saludo)).toHaveCount(0);

      // Y se quita igual.
      await page
        .locator("li")
        .filter({ hasText: practico })
        .getByRole("button", { name: copy.panel.mensajes.quitarDestacado })
        .click();
      await expect(page.getByText(copy.panel.mensajes.avisoSinDestacar)).toBeVisible();
      const sinMarca = await conBase(
        (sql) => sql`
          select 1 from public.mensajes_destacados where confirmacion_id = ${confirmacion}
        `,
      );
      expect(sinMarca).toHaveLength(0);
    } finally {
      await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${grupo}`);
    }
  });

  /**
   * CASO DE ERROR · destacar el mensaje de una invitación que se borró mientras
   * la bandeja estaba abierta dice que ya no está, sin culpar al permiso.
   */
  test("destacar un mensaje que ya no está lo dice", async ({ page }) => {
    const sello = Date.now();
    const grupo = `${MARCA} Se va ${sello}`;
    const texto = `(DES) Llegamos tarde ${sello}`;
    await conBase(async (sql) => {
      const [g] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre) values (${grupo}) returning id
      `;
      const [persona] = await sql<{ id: string }[]>`
        insert into public.invitados (grupo_id, nombre) values (${g.id}, '(DES) Tarde') returning id
      `;
      await sql`
        insert into public.confirmaciones
          (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento, mensaje)
        values (${persona.id}, 'confirmado', 'publico', false, false, ${texto})
      `;
    });

    await entrar(page);
    await page.goto(RUTA_MENSAJES);
    const entrada = page.locator("li").filter({ hasText: texto });
    await expect(entrada).toBeVisible();

    await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${grupo}`);
    await entrada.getByRole("button", { name: copy.panel.mensajes.destacar }).click();

    await expect(page.getByText(copy.panel.mensajes.errorMensajeNoExiste)).toBeVisible();
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

  test("se llega desde el menú del panel", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.mensajes }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_MENSAJES));
  });

  /**
   * LA PLAYLIST ES SU PROPIA PESTAÑA. Vivía debajo de todos los mensajes, bajo
   * un menú que dice «Mensajes», y quien buscaba la lista para el DJ no la
   * encontraba.
   *
   * CASO DE ERROR · las canciones no se cuelan en la bandeja: ni su título ni
   * la descarga para el DJ están en la pestaña de los mensajes.
   */
  test("mensajes y playlist son dos pestañas, y cada una marca la suya", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_MENSAJES);
    const pestanas = page.getByRole("navigation", {
      name: copy.panel.pestanas.de.replace("{modulo}", copy.panel.modulos.mensajes),
    });

    await expect(
      pestanas.getByRole("link", { name: copy.panel.pestanas.mensajes, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: copy.panel.mensajes.playlistTitulo, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: copy.panel.mensajes.exportarPlaylist }),
    ).toHaveCount(0);

    await pestanas
      .getByRole("link", { name: copy.panel.pestanas.playlist, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_PLAYLIST}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: copy.panel.mensajes.playlistTitulo }),
    ).toBeVisible();
    await expect(
      pestanas.getByRole("link", { name: copy.panel.pestanas.playlist, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(pestanas.locator('[aria-current="page"]')).toHaveCount(1);
  });

  /** Un grupo con una persona y su respuesta con mensaje. Devuelve los ids. */
  async function grupoConMensaje(grupo: string, mensaje: string) {
    return conBase(async (sql) => {
      const [g] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre) values (${grupo}) returning id
      `;
      const [persona] = await sql<{ id: string }[]>`
        insert into public.invitados (grupo_id, nombre) values (${g.id}, '(DES) Persona') returning id
      `;
      await responder(persona.id, mensaje);
      return { grupoId: g.id, personaId: persona.id };
    });
  }

  /** Una respuesta nueva de la misma persona: la anterior deja de ser la vigente. */
  function responder(personaId: string, mensaje: string) {
    return conBase(
      (sql) => sql`
        insert into public.confirmaciones
          (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento, mensaje)
        values (${personaId}, 'confirmado', 'publico', true, false, ${mensaje})
      `,
    );
  }

  /**
   * BODA-112 · CAMBIAR LA RESPUESTA NO DEVUELVE EL MENSAJE A «NUEVO».
   *
   * Responder otra vez inserta otra confirmación con el mismo mensaje —el
   * formulario lo trae ya escrito— y las marcas iban atadas a la fila vieja:
   * «la abuela es celíaca» volvía arriba como nuevo y sin su destacado.
   */
  test("cambiar la respuesta con el mismo mensaje no le quita el leído ni el destacado", async ({
    page,
  }) => {
    const sello = Date.now();
    const grupo = `${MARCA} Responden dos veces ${sello}`;
    const mensaje = `(DES) La abuela es celíaca ${sello}`;
    const { personaId } = await grupoConMensaje(grupo, mensaje);

    try {
      await entrar(page);
      await page.goto(RUTA_MENSAJES);
      const tarjeta = () => page.locator("li").filter({ hasText: mensaje });
      await tarjeta().getByRole("button", { name: copy.panel.mensajes.marcarLeido }).click();
      await expect(page.getByText(copy.panel.mensajes.marcado)).toBeVisible();
      await tarjeta().getByRole("button", { name: copy.panel.mensajes.destacar }).click();
      await expect(page.getByText(copy.panel.mensajes.avisoDestacado)).toBeVisible();

      // Semanas después pide autobús, sin tocar el mensaje.
      await responder(personaId, mensaje);
      await page.goto(RUTA_MENSAJES);

      await expect(tarjeta()).toHaveCount(1);
      await expect(
        tarjeta().getByText(copy.panel.mensajes.destacado, { exact: true }),
      ).toBeVisible();
      await expect(tarjeta().getByText(copy.panel.mensajes.nuevo, { exact: true })).toHaveCount(
        0,
      );

      // Y quitar el destacado lo quita de verdad, también de la fila vieja.
      await tarjeta()
        .getByRole("button", { name: copy.panel.mensajes.quitarDestacado })
        .click();
      await expect(page.getByText(copy.panel.mensajes.avisoSinDestacar)).toBeVisible();
      await expect(
        tarjeta().getByText(copy.panel.mensajes.destacado, { exact: true }),
      ).toHaveCount(0);

      // Si lo reescribe, sí es otro mensaje: sale como nuevo.
      const otro = `${mensaje}, y el primo también`;
      await responder(personaId, otro);
      await page.goto(RUTA_MENSAJES);
      await expect(
        page
          .locator("li")
          .filter({ hasText: otro })
          .getByText(copy.panel.mensajes.nuevo, { exact: true }),
      ).toBeVisible();
    } finally {
      await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${grupo}`);
    }
  });

  /**
   * CASO DE ERROR · destacar la tarjeta de un mensaje que el invitado acaba de
   * reescribir no puede decir «hecho»: la marca caería en una fila que ya no se
   * enseña.
   */
  test("destacar un mensaje que el invitado acaba de reescribir lo dice", async ({ page }) => {
    const sello = Date.now();
    const grupo = `${MARCA} Reescriben ${sello}`;
    const antes = `(DES) Llegamos a las ocho ${sello}`;
    const { personaId } = await grupoConMensaje(grupo, antes);

    try {
      await entrar(page);
      await page.goto(RUTA_MENSAJES);
      const tarjeta = page.locator("li").filter({ hasText: antes });
      await expect(tarjeta).toBeVisible();

      await responder(personaId, `(DES) Llegamos a las nueve ${sello}`);
      await tarjeta.getByRole("button", { name: copy.panel.mensajes.destacar }).click();

      await expect(page.getByText(copy.panel.mensajes.errorMensajeCambiado)).toBeVisible();
      await expect(page.getByText(copy.panel.mensajes.avisoDestacado)).toHaveCount(0);
    } finally {
      await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${grupo}`);
    }
  });

  /**
   * Repasar los destacados la semana antes de la boda: cada clic devolvía la
   * bandeja entera, con el buscador vacío. El filtro se pone de un toque y
   * sobrevive a las acciones.
   */
  test("el filtro de destacados se pone de un toque y no se pierde al marcar", async ({
    page,
  }) => {
    const sello = Date.now();
    const grupo = `${MARCA} Filtro ${sello}`;
    const practico = `(DES) Vamos con silla de ruedas ${sello}`;
    const { personaId } = await grupoConMensaje(grupo, practico);

    try {
      await entrar(page);
      await page.goto(`${RUTA_MENSAJES}?buscar=${encodeURIComponent(String(sello))}`);
      const tarjeta = () => page.locator("li").filter({ hasText: practico });
      await tarjeta().getByRole("button", { name: copy.panel.mensajes.destacar }).click();
      await expect(page.getByText(copy.panel.mensajes.avisoDestacado)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`buscar=${sello}`));

      await page.getByRole("link", { name: copy.panel.mensajes.verSoloDestacados }).click();
      await expect(page).toHaveURL(/destacados=1/);
      await expect(page).toHaveURL(new RegExp(`buscar=${sello}`));
      await expect(tarjeta()).toBeVisible();

      await tarjeta().getByRole("button", { name: copy.panel.mensajes.marcarLeido }).click();
      await expect(page.getByText(copy.panel.mensajes.marcado)).toBeVisible();
      await expect(page).toHaveURL(/destacados=1/);
      await expect(page).toHaveURL(new RegExp(`buscar=${sello}`));
      await expect(
        page.getByRole("link", { name: copy.panel.mensajes.verTodos }),
      ).toBeVisible();
      expect(personaId).toBeTruthy();
    } finally {
      await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${grupo}`);
    }
  });

  test("sin ningún destacado, el filtro lo dice en vez de hablar de una búsqueda", async ({
    page,
  }) => {
    const hay = await conBase((sql) => sql`select 1 from public.mensajes_destacados limit 1`);
    test.skip(hay.length > 0, "Hay destacados de otros tests: este caso necesita ninguno.");

    await entrar(page);
    await page.goto(`${RUTA_MENSAJES}?destacados=1`);
    await expect(page.getByText(copy.panel.mensajes.sinDestacados)).toBeVisible();
    await expect(page.getByText(copy.panel.mensajes.sinResultados)).toHaveCount(0);
  });
});
