import { expect, origenDelTest, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_DIA,
  RUTA_INVITADOS,
  URL_WHATSAPP,
  RUTA_MESAS,
  RUTA_MESAS_PLANO,
  RUTA_MESAS_REPARTO,
  RUTA_PANEL,
  RUTA_PENDIENTES,
  RUTA_RSVP,
} from "../../src/config/constants";

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
const cadena = process.env.DATABASE_URL;

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** La ficha de una invitación. Se espera a llegar aquí antes de seguir. */
const FICHA = new RegExp(`${RUTA_INVITADOS}/[0-9a-f-]{36}`);

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
    await expect(page).toHaveURL(FICHA);
    const campoEnlace = page.getByLabel(copy.panel.invitados.copiarEnlace);
    await expect(campoEnlace).toBeVisible();
    const enlace = await campoEnlace.inputValue();
    expect(enlace).toContain(`${RUTA_RSVP}/`);

    // Una persona dentro.
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Olalla");
    await page.getByLabel(copy.panel.invitados.apellidosPersona).fill("E2E");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Olalla E2E")).toBeVisible();

    // Ahora, como invitada: sesión aparte y sin JavaScript, que es como se abre
    // un enlace de estos desde WhatsApp.
    const rutaRsvp = new URL(enlace).pathname;
    const comoInvitada = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenDelTest(),
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
    // La que se ve: «Sí, viene» es también una opción, plegada, del formulario
    // con el que el panel apunta una respuesta por teléfono.
    await expect(page.getByText(copy.rsvp.vieneSi).filter({ visible: true })).toBeVisible();

    /*
      También en la lista, en el recuento del grupo.

      El nombre va como CADENA y no como `new RegExp(nombreGrupo)`: la marca
      empieza por «(DES)» y esos paréntesis son un grupo de captura, así que el
      patrón buscaba «DES E2E Invitación» —sin paréntesis— y no casaba con
      nada. Con una cadena, Playwright compara por subcadena y sin sorpresas.
    */
    await page.goto(`${RUTA_INVITADOS}?buscar=${encodeURIComponent(nombreGrupo)}`);
    await expect(page.getByRole("link", { name: nombreGrupo })).toContainText(
      copy.panel.invitados.resumenEstado
        .replace("{confirmados}", "1")
        .replace("{rechazados}", "0")
        .replace("{pendientes}", "0"),
    );
  });

  test("la búsqueda encuentra por el nombre de una persona, no sólo del grupo", async ({
    page,
  }) => {
    const nombreGrupo = `${MARCA} busqueda ${Date.now()}`;

    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Ainhoa");
    await page.getByLabel(copy.panel.invitados.apellidosPersona).fill("Zubeldía");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();

    // Sin acentos: quien busca desde el móvil no los escribe.
    await page.goto(`${RUTA_INVITADOS}?buscar=zubeldia`);
    await expect(page.getByRole("link", { name: nombreGrupo })).toBeVisible();
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
    await expect(page).toHaveURL(FICHA);

    /*
      EL ENLACE SE LEE AQUÍ, ANTES DE TOCAR NADA MÁS.

      El token en claro no está en la base —sólo su huella— así que la ficha
      sólo puede pintarlo mientras viaja en la URL. Las acciones de la propia
      ficha lo conservan; salir de ella lo pierde.
    */
    const primero = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();

    /*
      Con alguien dentro, y no por capricho: `obtener_invitacion()` devuelve
      una fila por persona, así que un grupo vacío devuelve cero filas — que es
      el mismo contrato que «este enlace no vale». Sin esto, el test creía
      estar comprobando la rotación del enlace cuando en realidad los dos
      enlaces fallaban por estar el grupo vacío.
    */
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Uxue");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Uxue")).toBeVisible();

    // Esperar a que la redirección haya llegado antes de leer el campo. Sin
    // esto se lee el enlace viejo, que sigue pintado, y el test compara una
    // cadena consigo misma.
    await page.getByRole("button", { name: copy.panel.invitados.emitirEnlace }).click();
    await expect(page).toHaveURL(/estado=enlace-emitido/);
    const segundo = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
    expect(segundo).not.toBe(primero);

    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenDelTest(),
    });
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
    await expect(page).toHaveURL(FICHA);
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();

    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Xabi");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();

    // Mientras no ha contestado, sí se puede quitar: el control está, y dice a quién.
    const quitarAXabi = page.getByLabel(
      copy.panel.invitados.quitarDe.replace("{persona}", "(DES) Xabi"),
    );
    await expect(quitarAXabi).toBeVisible();

    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenDelTest(),
    });
    const invitada = await contexto.newPage();
    await invitada.goto(new URL(enlace).pathname);
    await invitada.locator('input[value="rechazado"]').first().check();
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await invitada.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(invitada.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasNo);
    await contexto.close();

    // Contestado: el control de quitar desaparece.
    await page.reload();
    await expect(quitarAXabi).toHaveCount(0);
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
    await expect(page).toHaveURL(FICHA);
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Nekane");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Nekane")).toBeVisible();

    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenDelTest(),
    });
    const invitada = await contexto.newPage();
    await invitada.goto(new URL(enlace).pathname);
    await invitada.locator('input[value="confirmado"]').first().check();

    /*
      UN PASO CADA VEZ, Y ESPERANDO A VERLO.

      Con JavaScript apagado cada «Siguiente» es una navegación completa y
      Playwright la espera solo. Aquí no: el paso lo cambia una acción de
      servidor y el botón del paso anterior sigue en el DOM unos milisegundos,
      así que dos clics seguidos caen los dos en el mismo formulario y el
      asistente se queda donde estaba. Afirmar el título entre clic y clic es
      lo que ata cada uno a su paso.
    */
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(invitada.getByText(copy.rsvp.pasoDetallesTitulo)).toBeVisible();
    await invitada.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(invitada.getByText(copy.rsvp.pasoMensajeTitulo)).toBeVisible();
    await invitada.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(invitada.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    await page.goto(RUTA_PANEL);
    const despues = Number((await confirmados.first().textContent())?.trim() ?? "0");

    // Si esto no sube, las cifras no salen de la base.
    expect(despues).toBe(antes + 1);

    /*
      Y EN LA LOGÍSTICA SÓLO LO QUE EL RSVP PREGUNTA. Salía «Necesitan
      alojamiento: 0» —el formulario no lo pregunta y la base guarda `false`
      para todos—, que se leía como un dato. Son tres cifras: adultos, niños y
      autobús.
    */
    const logistica = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: copy.panel.resumen.bloqueLogistica }) });
    await expect(logistica.getByRole("term")).toHaveText([
      copy.panel.resumen.adultos,
      copy.panel.resumen.ninos,
      copy.panel.resumen.autobus,
    ]);
  });

  /*
    LAS DOS RAMAS VACÍAS —sin fecha, sin invitados— se prueban en
    `tests/unidad/resumen-vacio.test.tsx`, pintando la página con esos datos.
    Aquí, contra la semilla compartida, no se puede llegar a ninguna sin vaciar
    una base que usan todos los demás tests; este test se llamaba «sin fecha o
    sin invitados» y no recorría ninguno de los dos casos.
  */
  test("con la semilla enseña las cifras y una cuenta atrás concreta", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PANEL);

    // Con el seed hay invitados, así que se enseñan los bloques de cifras.
    await expect(
      page.getByRole("heading", { name: copy.panel.resumen.bloqueInvitados }),
    ).toBeVisible();
    // Y la cuenta atrás dice algo concreto, no un hueco.
    await expect(page.locator("main header")).not.toContainText("{dias}");
  });
});

/**
 * BODA-54 · Exportar la lista
 *
 * El catering, la finca y quien imprima las minutas van a pedir la lista. Lo
 * que se comprueba aquí son las dos cosas por las que un CSV se estropea de
 * verdad: que traiga **lo filtrado** y no la tabla entera, y que los acentos
 * lleguen enteros a Excel.
 */
test.describe("Exportar invitados", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /*
    LAS DESCARGAS VAN POR `page.request`, NO POR EL FIXTURE `request`.

    El fixture `request` de Playwright es un contexto de red aparte: no
    comparte las cookies del navegador, así que la petición llega sin sesión,
    la ruta redirige a la pantalla de acceso y lo que se descarga es el HTML
    del formulario de entrar. `page.request` sale del mismo contexto que la
    página y lleva la sesión puesta, que es lo que hace el navegador cuando se
    pulsa el botón de exportar.
  */
  test("el fichero trae lo filtrado, no la tabla entera", async ({ page }) => {
    await entrar(page);

    const marca = `${MARCA} export ${Date.now()}`;
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(marca);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Ainhoa");
    await page.getByLabel(copy.panel.invitados.apellidosPersona).fill("Zubeldía");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Ainhoa")).toBeVisible();

    // Sin filtro: salen todos, así que hay más de una fila de datos.
    const completo = await page.request.get(`${RUTA_INVITADOS}/exportar`);
    expect(completo.status()).toBe(200);
    const todas = (await completo.text()).trim().split("\r\n");

    // Con filtro: sólo la persona de este grupo.
    const filtrado = await page.request.get(
      `${RUTA_INVITADOS}/exportar?buscar=${encodeURIComponent(marca)}`,
    );
    const pocas = (await filtrado.text()).trim().split("\r\n");

    // Cabecera + una fila. Si el filtro no viajara, saldrían todas.
    expect(pocas).toHaveLength(2);
    expect(todas.length).toBeGreaterThan(pocas.length);
    expect(pocas[1]).toContain("(DES) Ainhoa");
  });

  /**
   * CASO DE ERROR. Sin BOM, Excel en Windows abre el fichero con su página de
   * códigos local y «Zubeldía» se convierte en «ZubeldÃ­a». Quien lo recibe es
   * el catering, y va a abrirlo con Excel.
   */
  /**
   * CASO DE ERROR · `?columna=constructor` pasaba el filtro de columnas.
   *
   * `in` mira también la cadena de prototipos, así que `constructor`,
   * `toString` o `__proto__` contaban como columnas y la ruta reventaba con un
   * 500 al traducir el rótulo. Lo que no es una columna se ignora, y sin
   * ninguna válida se llevan todas: es lo que hace el formulario.
   */
  /**
   * BODA-50 · filtrar por lado y por acompañantes, y ordenar. Y la descarga
   * trae lo mismo y en el mismo orden: el filtro y el orden viajan con ella.
   */
  test("filtrar por lado y ordenar por personas, en la lista y en el fichero", async ({
    page,
  }) => {
    await entrar(page);
    const marca = `${MARCA} orden ${Date.now()}`;
    const pequena = `${marca} A`;
    const grande = `${marca} B`;
    await conBase(async (sql) => {
      const [a] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre, lado)
        values (${pequena}, 'novia') returning id
      `;
      await sql`insert into public.invitados (grupo_id, nombre) values (${a.id}, '(DES) Sola')`;
      // La grande ya está mandada; la pequeña, no.
      const [b] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion
          (nombre, lado, maximo_acompanantes, invitacion_enviada_en)
        values (${grande}, 'novio', 1, now() - interval '1 day') returning id
      `;
      for (const nombre of ["(DES) Uno", "(DES) Dos", "(DES) Tres"]) {
        await sql`insert into public.invitados (grupo_id, nombre) values (${b.id}, ${nombre})`;
      }
    });

    const buscar = `buscar=${encodeURIComponent(marca)}`;
    const enlaces = page.getByRole("link", { name: marca });

    // Por nombre, A va antes; por personas, la grande primero.
    await page.goto(`${RUTA_INVITADOS}?${buscar}`);
    await expect(enlaces).toHaveCount(2);
    await expect(enlaces.first()).toContainText(pequena);
    await page.goto(`${RUTA_INVITADOS}?${buscar}&orden=personas`);
    await expect(enlaces.first()).toContainText(grande);

    // Cada fila dice si se ha mandado —no sólo si hay enlace—, y «sin enviar
    // primero» pone delante a la que falta.
    await expect(page.getByRole("link", { name: grande })).toContainText(
      copy.panel.invitados.listaMandadaEn.split("{")[0],
    );
    await expect(page.getByRole("link", { name: pequena })).not.toContainText(
      copy.panel.invitados.listaMandadaEn.split("{")[0],
    );
    await page.goto(`${RUTA_INVITADOS}?${buscar}&orden=envio`);
    await expect(enlaces.first()).toContainText(pequena);

    // Por lado y por acompañantes, cada filtro deja sólo la suya.
    await page.goto(`${RUTA_INVITADOS}?${buscar}&lado_filtro=novio`);
    await expect(enlaces).toHaveCount(1);
    await expect(enlaces).toContainText(grande);
    await page.goto(`${RUTA_INVITADOS}?${buscar}&acompanantes=sin`);
    await expect(enlaces).toHaveCount(1);
    await expect(enlaces).toContainText(pequena);

    // El fichero, con los mismos filtros: sólo la gente del novio.
    const fichero = await page.request.get(
      `${RUTA_INVITADOS}/exportar?${buscar}&lado_filtro=novio&orden=personas`,
    );
    const filas = (await fichero.text()).trim().split("\r\n");
    expect(filas).toHaveLength(4);
    expect(filas.slice(1).join("\n")).not.toContain("(DES) Sola");

    await conBase(
      (sql) => sql`delete from public.grupos_invitacion where nombre like ${`${marca}%`}`,
    );
  });

  /**
   * CASO DE ERROR · un orden o un lado inventados en la URL no rompen la lista:
   * caen a los de siempre.
   */
  test("un orden inventado en la URL cae al de siempre", async ({ page }) => {
    await entrar(page);
    const respuesta = await page.goto(`${RUTA_INVITADOS}?orden=constructor&lado_filtro=suegra`);
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByLabel(copy.panel.invitados.ordenar)).toHaveValue("nombre");
    // «De parte de» también es el rótulo del alta: se busca el del filtro.
    await expect(page.locator('select[name="lado_filtro"]')).toHaveValue("todos");
  });

  test("una columna inventada en la URL se ignora en vez de romper la descarga", async ({
    page,
  }) => {
    await entrar(page);
    const completo = await page.request.get(`${RUTA_INVITADOS}/exportar`);
    const cabecera = (await completo.text()).split("\r\n")[0];

    const trucado = await page.request.get(
      `${RUTA_INVITADOS}/exportar?columna=constructor&columna=__proto__&columna=toString`,
    );
    expect(trucado.status()).toBe(200);
    expect((await trucado.text()).split("\r\n")[0]).toBe(cabecera);

    // Y una válida entre inventadas sigue filtrando: sólo esa columna.
    const soloNombre = await page.request.get(
      `${RUTA_INVITADOS}/exportar?columna=constructor&columna=nombre`,
    );
    expect((await soloNombre.text()).split("\r\n")[0]).toBe(
      `\ufeff"${copy.panel.invitados.columnaNombre}"`,
    );
  });

  /**
   * CASO DE ERROR · Las alergias las escribe un invitado desde una URL pública
   * y las abre el catering con Excel: una celda que empiece por `=` se
   * evaluaría como fórmula. Va neutralizada con un apóstrofo delante.
   */
  test("una alergia que parece una fórmula llega a Excel como texto", async ({ page }) => {
    await entrar(page);
    test.skip(!cadena, "Hace falta DATABASE_URL para escribir la alergia.");

    const marca = `${MARCA} fórmula ${Date.now()}`;
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(marca);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Fórmula");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Fórmula")).toBeVisible();

    // Lo que escribiría un invitado malintencionado en el RSVP.
    const formula = '=HYPERLINK("https://phish.example";"Ver alergias")';
    await conBase(
      (sql) => sql`
        update public.invitados as i
           set alergias = ${formula}
          from public.grupos_invitacion as g
         where g.id = i.grupo_id and g.nombre = ${marca}
      `,
    );

    const fichero = await page.request.get(
      `${RUTA_INVITADOS}/exportar?buscar=${encodeURIComponent(marca)}`,
    );
    const [, fila] = (await fichero.text()).split("\r\n");

    // El apóstrofo delante, dentro de las comillas: Excel lo lee como texto.
    expect(fila).toContain(`"'=HYPERLINK(`);
    expect(fila).not.toContain(`;"=HYPERLINK(`);
  });

  /**
   * CASO DE ERROR · Una invitación sin nadie dentro no se manda.
   *
   * Su enlace abre «este enlace no es válido»: `obtener_invitacion()` devuelve
   * una fila por persona y cero filas es el contrato de enlace malo. El botón
   * de WhatsApp no aparece hasta que haya a quién invitar, y se dice por qué
   * al lado del enlace, que es donde se pulsa.
   */
  test("una invitación sin personas enseña el enlace con aviso y sin botón de WhatsApp", async ({
    page,
  }) => {
    await entrar(page);
    const marca = `${MARCA} vacía ${Date.now()}`;
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(marca);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);

    await expect(page.getByLabel(copy.panel.invitados.copiarEnlace)).toBeVisible();
    // Filtrado por texto: la ficha recién creada también anuncia «invitación
    // creada» con `role="status"`. Y exactamente uno: el aviso vivió un tiempo
    // duplicado, arriba junto al enlace y abajo junto a la lista de personas.
    const aviso = page
      .getByRole("status")
      .filter({ hasText: copy.panel.invitados.avisoSinPersonas });
    await expect(aviso).toHaveCount(1);
    await expect(aviso).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.panel.invitados.repartirBoton }),
    ).toHaveCount(0);
  });

  test("los acentos y la ñ sobreviven a Excel", async ({ page }) => {
    await entrar(page);

    const respuesta = await page.request.get(`${RUTA_INVITADOS}/exportar`);
    const bytes = await respuesta.body();

    // Los tres bytes del BOM, al principio y en ese orden.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const texto = bytes.toString("utf8");
    expect(texto).toContain("Zubeldía");
    // Y la cabecera va con los rótulos en castellano, no con nombres de columna.
    expect(texto).toContain(copy.panel.invitados.columnaAlergias);

    // Se descarga con su fecha en el nombre, para no acabar con cuatro
    // `invitados.csv` en la carpeta de descargas.
    const disposicion = respuesta.headers()["content-disposition"] ?? "";
    expect(disposicion).toMatch(/attachment; filename="invitados-\d{4}-\d{2}-\d{2}\.csv"/);
  });

  test("sin sesión no se descarga nada", async ({ browser }) => {
    // Un fichero con los datos de ciento veinte personas no se sirve a quien
    // acierte la URL.
    const contexto = await browser.newContext();
    const respuesta = await contexto.request.get(`${RUTA_INVITADOS}/exportar`, {
      maxRedirects: 0,
    });

    expect(respuesta.status()).toBeGreaterThanOrEqual(300);
    expect(respuesta.status()).toBeLessThan(400);
    await contexto.close();
  });
});

/**
 * BODA-110 · Repartir invitaciones por WhatsApp
 *
 * Nadie manda doscientos correos: las invitaciones se reparten por WhatsApp, de
 * una en una. Lo que se automatiza no es el envío —ocurre en otra aplicación—
 * sino no equivocarse de enlace, que es el fallo con consecuencias: mandarle a
 * una familia el enlace de otra le deja ver quién viene, qué come y qué
 * escribieron.
 */
test.describe("Repartir la invitación", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  /**
   * Crea una invitación con alguien dentro y devuelve su ficha ya abierta, con
   * el enlace puesto.
   *
   * CON ALGUIEN DENTRO, porque sin personas no hay a quién invitar y la ficha
   * no ofrece el botón de WhatsApp (ese caso tiene su propio test más arriba).
   * Añadir a la persona ya no hace perder el enlace: la ficha lo conserva
   * mientras se trabaja en ella, así que se lee tal cual.
   */
  async function crearConEnlace(page: Page, sufijo: string): Promise<string> {
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(sufijo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);

    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Reparto");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Reparto")).toBeVisible();

    return page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
  }

  test("el mensaje lleva el enlace de esta invitación y el texto de los copys", async ({
    page,
  }) => {
    const enlace = await crearConEnlace(page, `${MARCA} reparto ${Date.now()}`);
    const token = new URL(enlace).pathname.split("/").pop()!;

    const mensaje = await page.locator('textarea[name="mensaje"]').inputValue();

    // El texto sale de los copys, con el enlace dentro.
    expect(mensaje).toContain(enlace);
    expect(mensaje).toContain(
      copy.panel.invitados.repartirPlantilla
        .replace("{enlace}", "")
        .trim()
        .split("{")[0]
        .trim(),
    );

    // Y al mandarlo se va a WhatsApp con ese mismo texto codificado.
    const [destino] = await Promise.all([
      page.waitForRequest((peticion) => peticion.url().startsWith("https://wa.me/")),
      page.getByRole("button", { name: copy.panel.invitados.repartirBoton }).click(),
    ]);
    expect(decodeURIComponent(destino.url())).toContain(token);
  });

  /**
   * CASO DE ERROR · El token de otro grupo no se arrastra jamás.
   *
   * Es el fallo que este ticket existe para evitar. Se comprueba abriendo una
   * segunda invitación: su formulario tiene que llevar SU token, y la ficha de
   * un grupo cuyo enlace ya no está en la URL no puede ofrecer el botón, porque
   * no tiene ningún enlace que mandar.
   */
  test("cambiar de invitación cambia el enlace, y sin enlace no hay botón", async ({
    page,
  }) => {
    const sello = Date.now();
    const primero = await crearConEnlace(page, `${MARCA} reparto A ${sello}`);
    const fichaPrimera = page.url();

    const segundo = await crearConEnlace(page, `${MARCA} reparto B ${sello}`);
    expect(segundo).not.toBe(primero);

    // El formulario de la segunda ficha lleva el enlace de la segunda.
    const mensaje = await page.locator('textarea[name="mensaje"]').inputValue();
    expect(mensaje).toContain(segundo);
    expect(mensaje).not.toContain(primero);

    // Y al volver a la primera SIN el `?token=`, no hay nada que mandar: la
    // base guarda la huella, no el token, así que no se puede recuperar.
    await page.goto(fichaPrimera.split("?")[0]);
    await expect(page.locator('textarea[name="mensaje"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: copy.panel.invitados.repartirBoton }),
    ).toHaveCount(0);
    await expect(page.getByText(copy.panel.invitados.repartirSoloConEnlace)).toBeVisible();
  });

  test("queda anotado a quién se le ha mandado ya", async ({ page }) => {
    await crearConEnlace(page, `${MARCA} anotado ${Date.now()}`);
    const ficha = page.url().split("?")[0];

    await expect(page.getByText(copy.panel.invitados.repartirNunca)).toHaveCount(0);

    await Promise.all([
      page.waitForRequest((peticion) => peticion.url().startsWith("https://wa.me/")),
      page.getByRole("button", { name: copy.panel.invitados.repartirBoton }).click(),
    ]);

    // De vuelta en la ficha, sin enlace en la URL: dice cuándo se mandó.
    await page.goto(ficha);
    await expect(page.getByText(/Invitación mandada el/)).toBeVisible();
  });
});

/*
  UN `?estado=` INVENTADO NO TUMBA LA PANTALLA. Con `AVISOS[estado]`, un
  `?estado=constructor` devolvía la función `Object` —verdadera— y la pantalla
  reventaba al traducirla: un enlace manipulado dejaba sin invitados, mesas,
  pendientes ni día. Ahora el aviso sólo sale de lo que el mapa declara.
*/
test.describe("Un estado inventado en la URL", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test("un estado que sí existe sigue enseñando su aviso", async ({ page }) => {
    await page.goto(`${RUTA_INVITADOS}?estado=creada`);
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      copy.panel.invitados.creada,
    );
  });

  for (const ruta of [
    RUTA_INVITADOS,
    RUTA_MESAS,
    RUTA_MESAS_PLANO,
    RUTA_MESAS_REPARTO,
    RUTA_PENDIENTES,
    RUTA_DIA,
  ]) {
    test(`${ruta} aguanta «constructor», «__proto__» y «toString»`, async ({ page }) => {
      for (const trampa of ["constructor", "__proto__", "toString"]) {
        const respuesta = await page.goto(`${ruta}?estado=${trampa}`);
        expect(respuesta?.status(), `${ruta}?estado=${trampa}`).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText(copy.panel.errorTitulo)).toHaveCount(0);
      }
    });
  }
});

/*
  UN DOBLE TOQUE NO CREA DOS INVITACIONES. Los formularios del panel no se
  bloqueaban mientras la acción estaba en vuelo: con la conexión del móvil, un
  segundo toque en «Crear» antes de que volviera la respuesta creaba dos
  grupos —o dos personas, dos pagos, dos fotos—. Todos los botones de envío del
  panel se apagan ahora mientras su formulario está enviando.
*/
test.describe("Un doble toque en el panel", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test("crear una invitación con la respuesta retenida no la duplica", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_INVITADOS);
    const marca = `${MARCA} doble toque ${Date.now()}`;
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(marca);

    // Se retiene la acción para que el segundo toque llegue con la primera en vuelo.
    let soltar: () => void = () => {};
    const retenida = new Promise<void>((resolver) => (soltar = resolver));
    await page.route(`**${RUTA_INVITADOS}*`, async (ruta) => {
      if (ruta.request().method() === "POST") await retenida;
      await ruta.continue();
    });

    const crear = page.getByRole("button", { name: copy.panel.invitados.crear });
    await crear.click();
    await expect(crear).toBeDisabled();
    await crear.click({ force: true }).catch(() => {});

    soltar();
    await expect(page).toHaveURL(FICHA);

    const [{ cuantos }] = await conBase(
      (sql) => sql<{ cuantos: number }[]>`
        select count(*)::int as cuantos from public.grupos_invitacion where nombre = ${marca}
      `,
    );
    expect(cuantos).toBe(1);

    await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${marca}`);
  });
});

/*
  EL EMAIL DE CADA PERSONA, Y CORREGIR A QUIEN YA ESTÁ DADO DE ALTA.

  El acuse de recibo (BODA-57) sale a `invitados.correo_electronico`, y nada en
  el panel escribía esa columna: el acuse no podía salir nunca. Tampoco se
  podía corregir una errata en un nombre sin borrar a la persona.
*/
test.describe("El email y los datos de cada persona", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test("se apunta al dar de alta y se corrige después, y llega a la base", async ({ page }) => {
    const sello = Date.now();
    const nombreGrupo = `${MARCA} con email ${sello}`;
    const correo = `ana-${sello}@ejemplo.test`;
    const correoNuevo = `ana.nueva-${sello}@ejemplo.test`;

    await entrar(page);
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);

    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Anna");
    await page.getByLabel(copy.panel.invitados.correoPersona, { exact: true }).fill(correo);
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText(copy.panel.invitados.personaAnadida)).toBeVisible();
    await expect(page.getByText(correo)).toBeVisible();

    const [alta] = await conBase(
      (sql) => sql<{ id: string; correo_electronico: string | null }[]>`
        select i.id, i.correo_electronico from public.invitados as i
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.nombre = ${nombreGrupo}
      `,
    );
    expect(alta.correo_electronico, "el email tiene que llegar a la base").toBe(correo);

    // Se corrige la errata del nombre y se cambia el email.
    const etiqueta = copy.panel.invitados.editarPersonaDe.replace("{persona}", "(DES) Anna");
    await page
      .locator("summary")
      .filter({ hasText: copy.panel.invitados.editarPersona })
      .click();
    const formulario = page.getByRole("form", { name: etiqueta });
    await formulario
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Ana");
    await formulario
      .getByLabel(copy.panel.invitados.correoPersona, { exact: true })
      .fill(correoNuevo);
    await formulario.getByRole("button", { name: copy.panel.invitados.guardarPersona }).click();
    await expect(page.getByText(copy.panel.invitados.personaEditada)).toBeVisible();

    const [corregida] = await conBase(
      (sql) => sql<{ nombre: string; correo_electronico: string | null }[]>`
        select nombre, correo_electronico from public.invitados where id = ${alta.id}
      `,
    );
    expect(corregida).toEqual({ nombre: "(DES) Ana", correo_electronico: correoNuevo });

    await conBase(
      (sql) => sql`delete from public.grupos_invitacion where nombre = ${nombreGrupo}`,
    );
  });

  test("un email sin dominio completo se explica y no da de alta a nadie", async ({ page }) => {
    const sello = Date.now();
    const nombreGrupo = `${MARCA} email malo ${sello}`;

    await entrar(page);
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombreGrupo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);

    // El navegador lo da por bueno —no exige punto en el dominio— y la base no.
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Unai");
    await page
      .getByLabel(copy.panel.invitados.correoPersona, { exact: true })
      .fill("unai@fincalasierra");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();

    await expect(page.getByText(copy.panel.invitados.errorCorreo)).toBeVisible();
    const [{ cuantos }] = await conBase(
      (sql) => sql<{ cuantos: number }[]>`
        select count(*)::int as cuantos from public.invitados as i
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.nombre = ${nombreGrupo}
      `,
    );
    expect(cuantos, "no se da de alta a nadie").toBe(0);

    await conBase(
      (sql) => sql`delete from public.grupos_invitacion where nombre = ${nombreGrupo}`,
    );
  });
});

/**
 * AUDITORÍA DEL PANEL · LA FICHA DE UNA INVITACIÓN
 *
 * El enlace que se perdía al añadir a la primera persona, el enlace de la
 * familia que se anulaba de un toque, quitar sin confirmar y una ficha que no
 * decía quién es menor ni cuántos acompañantes caben.
 */
test.describe("La ficha de una invitación", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  async function crear(page: Page, nombre: string, acompanantes = 0): Promise<string> {
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(nombre);
    await page.getByLabel(copy.panel.invitados.maximoAcompanantes).fill(String(acompanantes));
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);
    return page.url().match(/invitados\/([^?]+)/)![1]!;
  }

  async function anadir(page: Page, nombre: string, menor = false) {
    // El alta, y no la corrección de quien ya está: las dos tienen «Nombre».
    const alta = page.locator('form[aria-labelledby="anadir-persona"]');
    await alta.getByLabel(copy.panel.invitados.nombrePersona, { exact: true }).fill(nombre);
    if (menor) await alta.getByLabel(copy.panel.invitados.esNino).check();
    await alta.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText(nombre).first()).toBeVisible();
  }

  test("añadir a la gente no hace perder el enlace, y se puede mandar sin emitir otro", async ({
    page,
  }) => {
    await crear(page, `${MARCA} sin perder ${Date.now()}`);
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();

    await anadir(page, "(DES) Primera");
    await anadir(page, "(DES) Segunda");

    await expect(page).toHaveURL(/estado=persona-anadida/);
    await expect(page.getByLabel(copy.panel.invitados.copiarEnlace)).toHaveValue(enlace);
    await expect(
      page.getByRole("button", { name: copy.panel.invitados.repartirBoton }),
    ).toBeVisible();
  });

  test("la ficha dice quién es menor y cuántos acompañantes caben", async ({ page }) => {
    await crear(page, `${MARCA} detalles ${Date.now()}`, 2);
    await anadir(page, "(DES) Peque", true);

    await expect(
      page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) }),
    ).toContainText(copy.panel.invitados.puedeTraer.replace("{cuantos}", "2"));
    await expect(page.locator("li").filter({ hasText: "(DES) Peque" })).toContainText(
      copy.panel.invitados.menor,
    );
  });

  test("quitar a alguien se confirma, y repetirlo desde una pantalla vieja lo dice", async ({
    page,
    context,
  }) => {
    const id = await crear(page, `${MARCA} quitar dos veces ${Date.now()}`);
    await anadir(page, "(DES) Zuriñe");

    // Una segunda pestaña con la misma ficha, que no se recarga.
    const vieja = await context.newPage();
    await vieja.goto(`${RUTA_INVITADOS}/${id}`);

    const etiqueta = copy.panel.invitados.quitarDe.replace("{persona}", "(DES) Zuriñe");
    const confirmar = copy.panel.invitados.quitarConfirmar;

    await page.getByLabel(etiqueta).click();
    await page.getByRole("button", { name: confirmar }).click();
    await expect(page).toHaveURL(/estado=persona-quitada/);
    await expect(page.getByText("(DES) Zuriñe")).toHaveCount(0);

    await vieja.getByLabel(etiqueta).click();
    await vieja.getByRole("button", { name: confirmar }).click();
    await expect(vieja).toHaveURL(/estado=persona-no-existe/);
    await expect(vieja.getByText(copy.panel.invitados.errorPersonaNoExiste)).toBeVisible();
    await expect(vieja.getByText(copy.panel.invitados.errorSinPermiso)).toHaveCount(0);
  });

  /**
   * CASO DE ERROR · la familia ya tiene su enlace en el WhatsApp. Emitir otro
   * se lo anula, y eso se confirma; sin confirmarlo —aunque el formulario se
   * mande a mano, sin la casilla— el enlace no cambia.
   */
  test("emitir otro enlace de una invitación ya mandada pide confirmarlo", async ({ page }) => {
    const id = await crear(page, `${MARCA} ya mandada ${Date.now()}`);
    await anadir(page, "(DES) Mandada");
    await conBase(
      (sql) =>
        sql`update public.grupos_invitacion set invitacion_enviada_en = now() where id = ${id}`,
    );
    const huellaAntes = await conBase(
      (sql) => sql<{ huella: string }[]>`
        select encode(huella_token, 'hex') as huella from public.grupos_invitacion where id = ${id}
      `,
    );

    await page.goto(`${RUTA_INVITADOS}/${id}`);
    await expect(page.getByText(copy.panel.invitados.repartirYaMandada)).toBeVisible();
    const casilla = page.getByLabel(copy.panel.invitados.emitirConfirmar);
    await expect(casilla).toHaveAttribute("required", "");

    // Mandado a mano, sin la casilla: no se anula nada.
    await casilla.evaluate((nodo) => nodo.removeAttribute("required"));
    await page.getByRole("button", { name: copy.panel.invitados.emitirEnlace }).click();
    await expect(page).toHaveURL(/estado=confirmar-emision/);
    await expect(page.getByText(copy.panel.invitados.errorConfirmarEmision)).toBeVisible();
    const huellaDespues = await conBase(
      (sql) => sql<{ huella: string }[]>`
        select encode(huella_token, 'hex') as huella from public.grupos_invitacion where id = ${id}
      `,
    );
    expect(huellaDespues[0]!.huella).toBe(huellaAntes[0]!.huella);

    // Confirmándolo, sí.
    await page.getByLabel(copy.panel.invitados.emitirConfirmar).check();
    await page.getByRole("button", { name: copy.panel.invitados.emitirEnlace }).click();
    await expect(page).toHaveURL(/estado=enlace-emitido/);
  });

  test("corregir el nombre, el lado y los acompañantes no anula el enlace", async ({
    page,
  }) => {
    const sello = Date.now();
    const id = await crear(page, `${MARCA} con errata ${sello}`);
    await anadir(page, "(DES) Corregida");
    const huella = () =>
      conBase(
        (sql) => sql<{ huella: string }[]>`
          select encode(huella_token, 'hex') as huella from public.grupos_invitacion where id = ${id}
        `,
      );
    const antes = await huella();

    await page.getByText(copy.panel.invitados.corregirInvitacion, { exact: true }).click();
    const formulario = page.locator("form").filter({
      has: page.getByRole("button", { name: copy.panel.invitados.guardarInvitacion }),
    });
    await formulario
      .getByLabel(copy.panel.invitados.nombreGrupo)
      .fill(`${MARCA} sin errata ${sello}`);
    await formulario.getByLabel(copy.panel.invitados.lado).selectOption("novio");
    await formulario.getByLabel(copy.panel.invitados.maximoAcompanantes).fill("3");
    await formulario
      .getByRole("button", { name: copy.panel.invitados.guardarInvitacion })
      .click();

    await expect(page).toHaveURL(/estado=invitacion-editada/);
    await expect(page.getByText(copy.panel.invitados.invitacionEditada)).toBeVisible();
    const [fila] = await conBase(
      (sql) => sql<{ nombre: string; lado: string; maximo_acompanantes: number }[]>`
        select nombre, lado::text as lado, maximo_acompanantes
          from public.grupos_invitacion where id = ${id}
      `,
    );
    expect(fila).toEqual({
      nombre: `${MARCA} sin errata ${sello}`,
      lado: "novio",
      maximo_acompanantes: 3,
    });
    expect(await huella()).toEqual(antes);
  });

  test("el tope de acompañantes no baja de los que ya están apuntados", async ({ page }) => {
    const id = await crear(page, `${MARCA} con acompañante ${Date.now()}`, 2);
    await conBase(
      (sql) => sql`
        insert into public.invitados (grupo_id, nombre, es_acompanante)
        values (${id}, '(DES) Acompañante uno', true), (${id}, '(DES) Acompañante dos', true)
      `,
    );
    await page.goto(`${RUTA_INVITADOS}/${id}`);

    await page.getByText(copy.panel.invitados.corregirInvitacion, { exact: true }).click();
    const formulario = page.locator("form").filter({
      has: page.getByRole("button", { name: copy.panel.invitados.guardarInvitacion }),
    });
    await formulario.getByLabel(copy.panel.invitados.maximoAcompanantes).fill("1");
    await formulario
      .getByRole("button", { name: copy.panel.invitados.guardarInvitacion })
      .click();

    await expect(page).toHaveURL(/estado=acompanantes-ocupados/);
    await expect(page.getByText(copy.panel.invitados.errorAcompanantesOcupados)).toBeVisible();
    const [fila] = await conBase(
      (sql) => sql<{ maximo: number }[]>`
        select maximo_acompanantes as maximo from public.grupos_invitacion where id = ${id}
      `,
    );
    expect(fila!.maximo).toBe(2);
  });

  test("una invitación sin respuestas se borra, confirmándolo, con su gente", async ({
    page,
  }) => {
    const nombre = `${MARCA} duplicada ${Date.now()}`;
    const id = await crear(page, nombre);
    await anadir(page, "(DES) Duplicada");

    await page.getByText(copy.panel.invitados.borrarInvitacion, { exact: true }).click();
    await expect(
      page.getByLabel(copy.panel.invitados.borrarInvitacionConfirmar),
    ).toHaveAttribute("required", "");
    await page.getByLabel(copy.panel.invitados.borrarInvitacionConfirmar).check();
    await page
      .getByRole("button", { name: copy.panel.invitados.borrarInvitacionBoton })
      .click();

    await expect(page).toHaveURL(new RegExp(`${RUTA_INVITADOS}\\?estado=invitacion-borrada`));
    await expect(page.getByText(copy.panel.invitados.invitacionBorrada)).toBeVisible();
    const quedan = await conBase(
      (sql) => sql`
        select 1 from public.grupos_invitacion where id = ${id}
        union all select 1 from public.invitados where grupo_id = ${id}
      `,
    );
    expect(quedan).toHaveLength(0);
  });

  /**
   * CASO DE ERROR · alguien contesta mientras la ficha está abierta. La
   * pantalla aún ofrece borrar, pero la acción mira la base en el momento:
   * con una respuesta dentro, no se borra nada.
   */
  test("una invitación con respuestas no se borra, aunque la pantalla aún lo ofrezca", async ({
    page,
  }) => {
    const id = await crear(page, `${MARCA} ya contestó ${Date.now()}`);
    await anadir(page, "(DES) Contestó");

    await page.getByText(copy.panel.invitados.borrarInvitacion, { exact: true }).click();
    await conBase(async (sql) => {
      const [persona] = await sql<{ id: string }[]>`
        select id from public.invitados where grupo_id = ${id} limit 1
      `;
      await sql`
        insert into public.confirmaciones
          (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
        values (${persona!.id}, 'rechazado', 'publico', false, false)
      `;
    });
    await page.getByLabel(copy.panel.invitados.borrarInvitacionConfirmar).check();
    await page
      .getByRole("button", { name: copy.panel.invitados.borrarInvitacionBoton })
      .click();

    await expect(page).toHaveURL(/estado=borrar-con-respuestas/);
    await expect(page.getByText(copy.panel.invitados.errorBorrarConRespuestas)).toBeVisible();
    // Y ahora que ha contestado, ya no se ofrece.
    await expect(
      page.getByText(copy.panel.invitados.borrarInvitacion, { exact: true }),
    ).toHaveCount(0);
    const sigue = await conBase(
      (sql) => sql`select 1 from public.grupos_invitacion where id = ${id}`,
    );
    expect(sigue).toHaveLength(1);
  });

  /**
   * LO QUE LLEGA POR TELÉFONO. La tía llama: viene, es celíaca y necesita el
   * autobús. Se apunta en su ficha y cuenta como cualquier otra respuesta,
   * con la marca de que la apuntó el panel.
   */
  test("una respuesta que llega por teléfono se apunta y cuenta", async ({ page }) => {
    const id = await crear(page, `${MARCA} por teléfono ${Date.now()}`);
    await anadir(page, "(DES) Tía Rosario");

    await page
      .getByLabel(
        copy.panel.invitados.apuntarRespuestaDe.replace("{persona}", "(DES) Tía Rosario"),
      )
      .click();
    const formulario = page.locator("form").filter({
      has: page.getByRole("button", { name: copy.panel.invitados.guardarRespuesta }),
    });
    await formulario.getByLabel(copy.rsvp.vieneSi).check();
    await formulario.getByLabel(copy.rsvp.menuEtiqueta).selectOption("sin_gluten");
    await formulario.getByLabel(copy.rsvp.alergias).fill("(DES) Celíaca");
    await formulario.getByLabel(copy.rsvp.autobusPersona).check();
    // El menú infantil no se ofrece a una adulta.
    await expect(formulario.locator('option[value="infantil"]')).toHaveCount(0);
    await formulario
      .getByRole("button", { name: copy.panel.invitados.guardarRespuesta })
      .click();

    await expect(page).toHaveURL(/estado=respuesta-apuntada/);
    await expect(page.getByText(copy.panel.invitados.respuestaApuntada)).toBeVisible();
    await expect(
      page.locator("li").filter({ hasText: "(DES) Tía Rosario" }).first(),
    ).toContainText(`${copy.rsvp.vieneSi} · ${copy.panel.menus.sin_gluten} · (DES) Celíaca`);

    const [respuesta] = await conBase(
      (sql) => sql<
        {
          estado: string;
          origen: string;
          con_autor: boolean;
          autobus: boolean;
          menu: string;
          alergias: string;
        }[]
      >`
        select c.estado::text as estado, c.origen::text as origen,
               c.registrado_por is not null as con_autor, c.necesita_autobus as autobus,
               i.tipo_menu::text as menu, i.alergias
          from public.confirmaciones c
          join public.invitados i on i.id = c.invitado_id
         where i.grupo_id = ${id} and c.es_vigente
      `,
    );
    expect(respuesta).toEqual({
      estado: "confirmado",
      origen: "panel",
      con_autor: true,
      autobus: true,
      menu: "sin_gluten",
      alergias: "(DES) Celíaca",
    });
  });

  test("apuntar una respuesta sin decir si viene no escribe nada", async ({ page }) => {
    const id = await crear(page, `${MARCA} sin decir ${Date.now()}`);
    await anadir(page, "(DES) Indecisa");

    await page
      .getByLabel(
        copy.panel.invitados.apuntarRespuestaDe.replace("{persona}", "(DES) Indecisa"),
      )
      .click();
    const formulario = page.locator("form").filter({
      has: page.getByRole("button", { name: copy.panel.invitados.guardarRespuesta }),
    });
    // Mandado a mano, sin el `required` de las dos opciones.
    await formulario
      .locator('input[name="estado"]')
      .evaluateAll((nodos) => nodos.forEach((nodo) => nodo.removeAttribute("required")));
    await formulario
      .getByRole("button", { name: copy.panel.invitados.guardarRespuesta })
      .click();

    await expect(page).toHaveURL(/estado=respuesta-sin-estado/);
    await expect(page.getByText(copy.panel.invitados.errorRespuestaSinEstado)).toBeVisible();
    const respuestas = await conBase(
      (sql) => sql`
        select 1 from public.confirmaciones c join public.invitados i on i.id = c.invitado_id
         where i.grupo_id = ${id} and c.origen = 'panel'
      `,
    );
    expect(respuestas).toHaveLength(0);
  });
});

/**
 * CON EL BUNDLE SIN CARGAR, «ABRIR WHATSAPP» TIENE QUE ABRIR WHATSAPP. La
 * acción anota el envío y redirige a `wa.me`; sin la hidratación, el
 * formulario se manda como un formulario de siempre, y la CSP no tenía `wa.me`
 * en `form-action`: la invitación quedaba «mandada» y WhatsApp no se abría.
 *
 * No se apaga JavaScript entero: el panel llega en bloques que revela un
 * script en línea, y sin él no se ve nada. Se bloquea el bundle, que es lo que
 * pasa de verdad con mala cobertura —se pulsa antes de que cargue—.
 */
test.describe("Repartir con el bundle sin cargar", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test("«Abrir WhatsApp» llega a WhatsApp", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_INVITADOS);
    await page
      .getByLabel(copy.panel.invitados.nombreGrupo)
      .fill(`${MARCA} sin js ${Date.now()}`);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);
    await page
      .locator('form[aria-labelledby="anadir-persona"]')
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Sin bundle");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Sin bundle").first()).toBeVisible();

    // Desde aquí, la ficha se carga sin su JavaScript.
    await page.route("**/_next/static/**/*.js", (ruta) => ruta.abort());
    await page.route(`${URL_WHATSAPP}**`, (ruta) =>
      ruta.fulfill({ status: 200, contentType: "text/plain", body: "wa" }),
    );
    await page.reload();

    const peticion = page.waitForRequest((p) => p.url().startsWith(URL_WHATSAPP));
    await page.getByRole("button", { name: copy.panel.invitados.repartirBoton }).click();
    await peticion;
  });
});
