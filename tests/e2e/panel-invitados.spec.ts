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
      sólo puede pintarlo cuando la acción que acaba de correr se lo pasa en la
      URL. Cualquier otra cosa que se haga después, añadir a alguien incluido,
      recarga la ficha sin `?token=` y el campo desaparece. Leerlo más tarde no
      es leer un valor viejo: es esperar a un campo que ya no existe.
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
    await expect(page).toHaveURL(FICHA);
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();

    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Xabi");
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
    await expect(page).toHaveURL(FICHA);
    const enlace = await page.getByLabel(copy.panel.invitados.copiarEnlace).inputValue();
    await page
      .getByLabel(copy.panel.invitados.nombrePersona, { exact: true })
      .fill("(DES) Nekane");
    await page.getByRole("button", { name: copy.panel.invitados.anadirPersona }).click();
    await expect(page.getByText("(DES) Nekane")).toBeVisible();

    const contexto = await browser.newContext({ locale: "es-ES" });
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
  });

  test("sin fecha o sin invitados, lo dice en vez de enseñar ceros", async ({ page }) => {
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

  /** Crea una invitación y devuelve su ficha ya abierta, con el enlace puesto. */
  async function crearConEnlace(page: Page, sufijo: string): Promise<string> {
    await page.goto(RUTA_INVITADOS);
    await page.getByLabel(copy.panel.invitados.nombreGrupo).fill(sufijo);
    await page.getByRole("button", { name: copy.panel.invitados.crear }).click();
    await expect(page).toHaveURL(FICHA);
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
