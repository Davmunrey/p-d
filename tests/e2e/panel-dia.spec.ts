import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  AJUSTE_MAXIMO_RECUENTO,
  CLAVE_ALMACEN_DIA,
  RUTA_ACCESO,
  RUTA_AGENDA_DIA,
  RUTA_BUSCAR_DIA,
  RUTA_DIA,
  RUTA_EXPORTAR_DIA,
  RUTA_GUION_DIA,
  RUTA_PANEL,
  RUTA_RECUENTO,
} from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-100 a BODA-104 (#67 #68 #69 #70 #71) · EL DÍA DE LA BODA
 *
 * Cinco pantallas que sólo se usan una vez, y ese día no hay a quién llamar si
 * algo falla. Así que se prueban las cinco contra la base de verdad.
 *
 * LO QUE DE VERDAD HAY QUE DEMOSTRAR AQUÍ es lo que ningún otro módulo del
 * panel hace: que marcar un punto SIN CONEXIÓN no pierde la marca y que se
 * manda sola al volver la cobertura. Es el caso de error literal del ticket
 * #67, y es la razón por la que esa pantalla tiene estado en el navegador.
 * Playwright puede cortar la red de verdad —`context.setOffline`—, así que se
 * prueba cortándola, no simulando que se corta.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Día";

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

const SIN_DESTINO = "(ninguna acción ha redirigido: ¿llegó a enviarse el formulario?)";

/** El mismo ayudante del molde: se afirma el destino que devolvió la acción. */
async function esperarEstado(pagina: Page, esperado: string) {
  try {
    await expect
      .poll(() => ultimoDestino(pagina) ?? SIN_DESTINO, { timeout: 30_000 })
      .toMatch(new RegExp(`estado=${esperado}(&|$)`));
  } catch (fallo) {
    const enPantalla = await pagina
      .locator("main")
      .innerText()
      .catch(() => "(no se pudo leer la pantalla)");
    throw new Error(
      `${(fallo as Error).message}\n\nLo que hizo la pestaña:\n${laPista(pagina)}` +
        `\n\nLa pantalla decía:\n${enPantalla.slice(0, 600)}`,
    );
  }

  const destino = ultimoDestino(pagina);
  olvidarDestinos(pagina);

  if (destino) {
    if (!pagina.url().includes(`estado=${esperado}`)) {
      console.warn(`#126: la pestaña no siguió la redirección a ${destino}.`);
    }
    await pagina.goto(destino);
  }

  await pagina.waitForLoadState("networkidle");
}

interface Sembrado {
  sello: number;
  primerPunto: string;
  segundoPunto: string;
  contratado: string;
  descartado: string;
  telefonoDelDia: string;
  invitado: { nombre: string; apellidos: string; mesa: string };
}

/**
 * Todo lo que el módulo necesita, en una sola siembra.
 *
 * LOS DATOS LLEVAN ACENTOS Y EÑE A PROPÓSITO. El caso de error del ticket #71
 * es literalmente «los nombres con ñ y acentos se leen bien al reabrirlo», y el
 * del #69 es que «gonzalez» encuentre a «González». Sembrar «Perez» no probaría
 * ninguna de las dos cosas.
 */
async function sembrar(sello: number): Promise<Sembrado> {
  const primerPunto = `${MARCA} Salida del autobús ${sello}`;
  const segundoPunto = `${MARCA} Entrada de los novios ${sello}`;
  const contratado = `${MARCA} Floristería Muñoz ${sello}`;
  const descartado = `${MARCA} Floristería descartada ${sello}`;
  const telefonoDelDia = "+34 600 112 233";
  const invitado = {
    nombre: "Begoña",
    apellidos: `González Ibáñez ${sello}`,
    mesa: `${MARCA} Mesa ${sello}`,
  };

  await limpiar();

  return conBase(async (sql) => {
    await sql`
      insert into public.guion_dia (hora, titulo, responsable, orden)
      values (${"12:30"}, ${primerPunto}, ${"Marta"}, ${900}),
             (${"13:15"}, ${segundoPunto}, null, ${901})
    `;

    const [categoria] = await sql<{ id: string }[]>`
      insert into public.categorias_proveedor (nombre, orden)
      values (${`${MARCA} Flores ${sello}`}, 70)
      returning id
    `;

    const [proveedor] = await sql<{ id: string }[]>`
      insert into public.proveedores (categoria_id, nombre, estado, telefono)
      values (${categoria.id}, ${contratado}, 'contratado', ${"+34 900 000 000"})
      returning id
    `;

    /*
      El descartado existe para comprobar que NO sale: es el caso de error de
      #68.

      Y LLEVA SU MOTIVO PORQUE LA BASE LO EXIGE. `proveedores_descartado_con_
      motivo` obliga a que un descartado tenga escrito por qué —y a que el que
      no lo está no lo tenga—, así que sembrarlo sin motivo no es un atajo: es
      un estado que la aplicación no puede producir. Aquí se cayeron los siete
      tests de este fichero de una vez, todos en esta línea.
    */
    await sql`
      insert into public.proveedores (categoria_id, nombre, estado, telefono, motivo_descarte)
      values (${categoria.id}, ${descartado}, 'descartado', ${"+34 911 111 111"},
              ${"Se fue de precio"})
    `;

    await sql`
      insert into public.contactos_proveedor (proveedor_id, nombre, papel, telefono, es_del_dia)
      values (${proveedor.id}, ${"Rocío"}, ${"jefa de sala"}, ${telefonoDelDia}, true)
    `;

    const [mesa] = await sql<{ id: string }[]>`
      insert into public.mesas (nombre, capacidad)
      values (${invitado.mesa}, 10)
      returning id
    `;

    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre)
      values (${`${MARCA} Grupo ${sello}`})
      returning id
    `;

    const [persona] = await sql<{ id: string }[]>`
      insert into public.invitados
        (grupo_id, mesa_id, nombre, apellidos, tipo_menu, alergias)
      values (${grupo.id}, ${mesa.id}, ${invitado.nombre}, ${invitado.apellidos},
              'sin_gluten', ${"Celíaca"})
      returning id
    `;

    /*
      SE CONFIRMA REGISTRANDO UNA RESPUESTA NUEVA, no editando la que había.

      La base crea una `pendiente` al dar de alta al invitado, y de ahí sale la
      tentación de hacerle un `update`. No se puede: `proteger_historial_
      confirmaciones` lo rechaza con «las confirmaciones son inmutables:
      registra una respuesta nueva» (CNF01). Y hace bien — lo que alguien
      contestó el martes no se reescribe el jueves, se añade encima.

      Así que se inserta, que es exactamente lo que hace el RSVP, y el trigger
      se encarga de dejar vigente la última. Es el mismo molde que usa la
      siembra de mesas.
    */
    await sql`
      insert into public.confirmaciones
        (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
      values (${persona.id}, 'confirmado', 'publico', false, false)
    `;

    return {
      sello,
      primerPunto,
      segundoPunto,
      contratado,
      descartado,
      telefonoDelDia,
      invitado,
    };
  });
}

/**
 * TODO LO SEMBRADO SE VA, Y SE VA ANTES DE CADA SIEMBRA.
 *
 * Nació sólo como `afterAll` y eso era el error: cada test sembraba encima del
 * anterior, así que a la tercera había tres «Rocío» con el mismo teléfono y
 * tres invitadas con la misma alergia. Los localizadores dejaban de ser únicos
 * y Playwright cortaba por lo sano —«strict mode violation: resolved to 3
 * elements»—, que además es un fallo que sólo aparece a partir del segundo
 * test y desaparece al ejecutar ese test solo.
 *
 * Sembrar sobre limpio es más lento y no admite discusión sobre qué hay dentro.
 */
async function limpiar() {
  if (!cadena) return;
  await conBase(async (sql) => {
    await sql`delete from public.guion_dia where titulo like ${`${MARCA}%`}`;
    await sql`
      delete from public.invitados
       where grupo_id in (select id from public.grupos_invitacion where nombre like ${`${MARCA}%`})
    `;
    await sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%`}`;
    await sql`delete from public.mesas where nombre like ${`${MARCA}%`}`;
    await sql`
      delete from public.contactos_proveedor
       where proveedor_id in (select id from public.proveedores where nombre like ${`${MARCA}%`})
    `;
    await sql`delete from public.proveedores where nombre like ${`${MARCA}%`}`;
    await sql`delete from public.categorias_proveedor where nombre like ${`${MARCA}%`}`;
    /*
      Las correcciones del recuento, por su nota. Las borraba cada test al
      final, y un test que se cae antes de su última línea dejaba el catering
      con un «−1» en el menú sin gluten para todos los que venían detrás.
    */
    await sql`delete from public.correcciones_recuento where nota like ${`${MARCA}%`}`;
  });
}

test.afterAll(limpiar);

test.describe("El día de la boda", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => seguirLaPista(page));

  /**
   * CAMINO FELIZ · #67 — marcar un punto persiste tras recargar.
   */
  test("marcar un punto del guion se guarda y sobrevive a recargar", async ({ page }) => {
    const sembrado = await sembrar(Date.now());

    await entrar(page);
    await page.goto(RUTA_DIA);

    const punto = page.locator("li").filter({ hasText: sembrado.primerPunto });
    await expect(punto).toHaveAttribute("data-hecho", "no");

    // Lo que toca ahora es justo el primero sin marcar.
    await expect(page.getByText(copy.panel.dia.guion.tocaAhora)).toBeVisible();

    await punto
      .getByRole("button", {
        name: copy.panel.dia.guion.marcarEste.replace("{titulo}", sembrado.primerPunto),
      })
      .click();

    await expect(punto).toHaveAttribute("data-hecho", "si");

    /*
      LA PRUEBA DE VERDAD ES LA BASE, no el tachado. La pantalla se pinta como
      marcada antes de mandar nada —es lo que la hace útil sin cobertura—, así
      que afirmar sólo lo que se ve daría por bueno un guardado que no ocurrió.
    */
    await expect
      .poll(
        async () =>
          conBase(
            async (sql) =>
              (
                await sql<{ hecho_en: string | null }[]>`
                  select hecho_en from public.guion_dia where titulo = ${sembrado.primerPunto}
                `
              )[0]?.hecho_en,
          ),
        { timeout: 15_000 },
      )
      .not.toBeNull();

    /*
      Y SIGUE MARCADO DESPUÉS DE QUE EL SERVIDOR DIGA QUE SÍ, sin recargar.
      Justo aquí se desmarcaba sola: al confirmarse, la marca salía de la cola y
      la pantalla caía de vuelta a las propiedades con las que se pintó, que son
      de antes de marcar. El test que había pasaba por encima del hueco —miraba
      antes de mandar y después de recargar—, así que el fallo vivía entre sus
      dos aserciones.
    */
    await expect(
      punto,
      "la marca no puede borrarse al confirmarla el servidor",
    ).toHaveAttribute("data-hecho", "si");

    // Y tras recargar sigue marcado, que es el criterio literal del ticket.
    await page.reload();
    await expect(page.locator("li").filter({ hasText: sembrado.primerPunto })).toHaveAttribute(
      "data-hecho",
      "si",
    );
  });

  /**
   * CAMINO FELIZ · #67 — el guion se escribe desde el panel.
   *
   * La lista de control se entregó sabiendo marcar y sin saber escribir: decía
   * «se escribe punto a punto» y no había dónde. Se recorre el ciclo entero
   * desde la pantalla y se comprueba cada paso en la base.
   */
  test("el guion se escribe desde el panel: se añade, se corrige y se quita", async ({
    page,
  }) => {
    await limpiar();
    const titulo = `${MARCA} Brindis ${Date.now()}`;
    const escribir = copy.panel.dia.escribir;

    await entrar(page);
    await page.goto(RUTA_DIA);
    await page.getByRole("link", { name: copy.panel.dia.guion.escribir }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_GUION_DIA));

    const alta = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: escribir.nuevoTitulo }) });
    await alta.getByLabel(escribir.campoHora, { exact: true }).fill("al acabar el cóctel");
    await alta.getByLabel(escribir.campoTitulo, { exact: true }).fill(titulo);
    await alta.getByLabel(escribir.campoResponsable, { exact: true }).fill("(DES) El padrino");
    await alta.getByRole("button", { name: escribir.anadir }).click();
    await esperarEstado(page, "creado");

    const leer = () =>
      conBase(
        (sql) => sql<{ hora: string; responsable: string | null }[]>`
          select hora, responsable from public.guion_dia where titulo = ${titulo}
        `,
      );
    const [creado] = await leer();
    expect(creado, "el punto tenía que estar en la base").toBeDefined();
    expect(creado.hora).toBe("al acabar el cóctel");
    expect(creado.responsable).toBe("(DES) El padrino");

    // Y aparece en la lista de control, que es donde se usa.
    await page.goto(RUTA_DIA);
    await expect(page.locator("li").filter({ hasText: titulo })).toBeVisible();

    // Se corrige la hora.
    await page.goto(RUTA_GUION_DIA);
    const fila = page.locator("li").filter({ hasText: titulo });
    await fila.locator("summary").click();
    await fila.getByLabel(escribir.campoHora, { exact: true }).fill("23:30");
    await fila.getByRole("button", { name: escribir.guardar }).click();
    await esperarEstado(page, "editado");
    expect((await leer())[0].hora).toBe("23:30");

    // Y se quita.
    await page
      .locator("li")
      .filter({ hasText: titulo })
      .getByRole("button", { name: escribir.borrarEste.replace("{titulo}", titulo) })
      .click();
    await esperarEstado(page, "borrado");
    expect(await leer(), "quitarlo lo quita de la base").toHaveLength(0);
  });

  /**
   * CASO DE ERROR · un punto sin hora no se guarda, y se dice qué falta.
   */
  test("un punto sin hora se explica y no se apunta", async ({ page }) => {
    const titulo = `${MARCA} Sin hora ${Date.now()}`;
    const escribir = copy.panel.dia.escribir;

    await entrar(page);
    await page.goto(RUTA_GUION_DIA);

    const alta = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: escribir.nuevoTitulo }) });
    // Sin el `required` del campo, para que decida el servidor.
    const hora = alta.getByLabel(escribir.campoHora, { exact: true });
    await hora.evaluate((campo) => campo.removeAttribute("required"));
    await hora.fill("   ");
    await alta.getByLabel(escribir.campoTitulo, { exact: true }).fill(titulo);
    await alta.getByRole("button", { name: escribir.anadir }).click();
    await esperarEstado(page, "hora");

    await expect(page.getByText(escribir.avisos.hora)).toBeVisible();
    const filas = await conBase(
      (sql) => sql`select 1 from public.guion_dia where titulo = ${titulo}`,
    );
    expect(filas, "no se apunta nada").toHaveLength(0);
  });

  /**
   * CASO DE ERROR · marcar un punto que alguien acaba de quitar.
   *
   * Desde que el guion se escribe en el panel, un punto puede desaparecer con
   * la lista de control abierta en otro móvil. Marcarlo decía «esta cuenta
   * sólo puede mirar», que es falso y manda a buscar un problema de permisos.
   */
  test("marcar un punto que ya no está lo dice, sin culpar al permiso", async ({ page }) => {
    const sembrado = await sembrar(Date.now() + 9);

    await entrar(page);
    await page.goto(RUTA_DIA);
    await page.waitForLoadState("networkidle");

    const punto = page.locator("li").filter({ hasText: sembrado.primerPunto });
    await conBase(
      (sql) => sql`delete from public.guion_dia where titulo = ${sembrado.primerPunto}`,
    );
    await punto
      .getByRole("button", {
        name: copy.panel.dia.guion.marcarEste.replace("{titulo}", sembrado.primerPunto),
      })
      .click();

    await expect(page.getByText(copy.panel.dia.guion.noExiste)).toBeVisible();
    await expect(page.getByText(copy.panel.dia.guion.sinPermiso)).toHaveCount(0);
    // Y no se queda en la cola reintentando algo que no va a llegar nunca.
    await expect(page.locator("[data-sin-mandar]")).toBeHidden();
  });

  /**
   * CASO DE ERROR · #67 — sin conexión, lo marcado no se pierde y se manda al
   * volver la cobertura.
   *
   * ES EL TEST QUE JUSTIFICA LA ARQUITECTURA DE ESA PANTALLA. Se corta la red
   * de verdad con `setOffline`, se marca, y se comprueba que la pantalla lo
   * sabe («sin mandar»); después se devuelve la red y se comprueba que la marca
   * llega a la base sola, sin que nadie vuelva a pulsar.
   */
  test("sin conexión lo marcado se queda apuntado y se manda al volver", async ({
    page,
    context,
  }) => {
    const sembrado = await sembrar(Date.now() + 1);

    await entrar(page);
    await page.goto(RUTA_DIA);
    await page.waitForLoadState("networkidle");

    const punto = page.locator("li").filter({ hasText: sembrado.segundoPunto });
    const marcar = punto.getByRole("button", {
      name: copy.panel.dia.guion.marcarEste.replace("{titulo}", sembrado.segundoPunto),
    });

    await context.setOffline(true);
    await marcar.click();

    // Se ve marcado aunque no haya salido de aquí...
    await expect(punto).toHaveAttribute("data-hecho", "si");
    // ...y la pantalla lo dice, en vez de fingir que está guardado.
    await expect(page.locator("[data-sin-mandar]")).toBeVisible();

    // En la base todavía no hay nada: no se ha inventado un guardado.
    const antes = await conBase(
      async (sql) =>
        (
          await sql<{ hecho_en: string | null }[]>`
            select hecho_en from public.guion_dia where titulo = ${sembrado.segundoPunto}
          `
        )[0]?.hecho_en,
    );
    expect(antes, "sin conexión no puede haber llegado nada a la base").toBeNull();

    // Vuelve la cobertura. Nadie pulsa nada más.
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(
        async () =>
          conBase(
            async (sql) =>
              (
                await sql<{ hecho_en: string | null }[]>`
                  select hecho_en from public.guion_dia where titulo = ${sembrado.segundoPunto}
                `
              )[0]?.hecho_en,
          ),
        { timeout: 20_000 },
      )
      .not.toBeNull();

    // Y el aviso de «sin mandar» desaparece solo, porque ya no queda nada.
    await expect(page.locator("[data-sin-mandar]")).toBeHidden();
  });

  /**
   * CASO DE ERROR · Deshacer con la marca anterior todavía en vuelo.
   *
   * Conexión lenta: se marca, y antes de que conteste el servidor se deshace.
   * Cuando volvía la respuesta de la PRIMERA petición, la cola soltaba el
   * punto por id y tiraba la marca NUEVA sin haberla mandado: la pantalla
   * saltaba sola a «hecho», el aviso de pendientes desaparecía, y si la
   * segunda petición fallaba no quedaba nada que reintentar. La primera
   * petición se retrasa con `page.route` y la segunda se corta.
   */
  test("deshacer con la marca anterior en vuelo no se pierde aunque la red falle", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 2);
    await entrar(page);
    await page.goto(RUTA_DIA);
    await page.waitForLoadState("networkidle");

    const punto = page.locator("li").filter({ hasText: sembrado.segundoPunto });
    const marcar = punto.getByRole("button", {
      name: copy.panel.dia.guion.marcarEste.replace("{titulo}", sembrado.segundoPunto),
    });
    const deshacer = punto.getByRole("button", {
      name: copy.panel.dia.guion.desmarcarEste.replace("{titulo}", sembrado.segundoPunto),
    });

    // Las acciones de servidor son POST a la propia ruta: la primera tarda,
    // la segunda se cae.
    let peticiones = 0;
    await page.route(`**${RUTA_DIA}**`, async (ruta) => {
      if (ruta.request().method() !== "POST") return ruta.continue();
      peticiones += 1;
      if (peticiones === 1) {
        await new Promise((listo) => setTimeout(listo, 1_500));
        return ruta.continue();
      }
      return ruta.abort("failed");
    });

    await marcar.click();
    await expect(punto).toHaveAttribute("data-hecho", "si");
    await deshacer.click();
    await expect(punto).toHaveAttribute("data-hecho", "no");

    // Llega la respuesta de marcar. Lo último que se pulsó fue deshacer, y
    // sigue siendo lo que se ve y lo que queda por mandar.
    await expect.poll(async () => peticiones, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(2_000);
    await expect(punto).toHaveAttribute("data-hecho", "no");
    await expect(page.locator("[data-sin-mandar]")).toBeVisible();

    // Vuelve la red: se manda lo pendiente y la base acaba como la pantalla.
    await page.unroute(`**${RUTA_DIA}**`);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(
        async () =>
          conBase(
            async (sql) =>
              (
                await sql<{ hecho_en: string | null }[]>`
                  select hecho_en from public.guion_dia where titulo = ${sembrado.segundoPunto}
                `
              )[0]?.hecho_en,
          ),
        { timeout: 20_000 },
      )
      .toBeNull();
    await expect(page.locator("[data-sin-mandar]")).toBeHidden();
  });

  /**
   * CAMINO FELIZ · #68 — los teléfonos son enlaces `tel:` con el número de la
   * base. CASO DE ERROR · un proveedor descartado no aparece.
   */
  test("la agenda enseña a los contratados con enlace de llamada y esconde a los descartados", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 2);

    await entrar(page);
    await page.goto(RUTA_AGENDA_DIA);

    await expect(page.getByRole("heading", { name: sembrado.contratado })).toBeVisible();

    /*
      EL `href` SE COMPRUEBA ENTERO Y SIN ESPACIOS. El número se guarda como lo
      escribe una persona —«+34 600 112 233»— y el enlace tiene que llevar sólo
      el «+» y las cifras: es la conversión que hace `paraLlamar`, y es lo que
      decide si al pulsar se llama o no se llama.
    */
    /*
      SE BUSCA DENTRO DE SU FICHA. Otro proveedor puede tener también una
      «Rocío» —en los datos de demostración la hay—, y el enlace que importa es
      el de este.
    */
    const ficha = page.locator("article", {
      has: page.getByRole("heading", { name: sembrado.contratado }),
    });
    const llamar = ficha.getByRole("link", {
      name: copy.panel.dia.agenda.llamarA.replace("{nombre}", "Rocío"),
    });
    await expect(llamar).toHaveAttribute(
      "href",
      `tel:${sembrado.telefonoDelDia.replace(/[^\d+]/g, "")}`,
    );
    /*
      EL NÚMERO VA DELANTE, Y SE ANCLA AL PRINCIPIO A PROPÓSITO. Lo que se ve
      sigue siendo el número y nada más —que es lo que hay que poder dictar—,
      pero el enlace lleva detrás un texto que sólo oye un lector de pantalla:
      «Llamar a Rocío». Va DENTRO y no en un `aria-label` porque un `aria-label`
      sustituye al rótulo visible, y entonces quien maneja el móvil por voz lee
      un número y tiene que decir un nombre (WCAG 2.5.3). Comparar la cadena
      entera obligaría a elegir entre las dos cosas; anclarla al principio
      afirma las dos: el número primero, el contexto después.
    */
    const cifras = sembrado.telefonoDelDia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(llamar).toHaveText(new RegExp(`^${cifras}\\b`));
    await expect(llamar).toHaveAccessibleName(
      new RegExp(
        `^${cifras}\\s+${copy.panel.dia.agenda.llamarA.replace("{nombre}", "Rocío")}$`,
      ),
    );

    // El contacto del día va marcado: es a quien hay que llamar.
    await expect(ficha.getByText(copy.panel.dia.agenda.contactoDelDia)).toBeVisible();

    /*
      Y VA EL PRIMERO, por delante del teléfono de la ficha. Con prisa se pulsa
      el primer número, y ese tiene que ser el de quien está allí, no el de la
      oficina.
    */
    await expect(ficha.locator('a[href^="tel:"]').first()).toHaveAttribute(
      "href",
      `tel:${sembrado.telefonoDelDia.replace(/[^\d+]/g, "")}`,
    );
    await expect(ficha.locator('a[href^="tel:"]')).toHaveCount(2);

    // CASO DE ERROR: el descartado no está por ninguna parte.
    await expect(page.getByText(sembrado.descartado)).toHaveCount(0);
  });

  /**
   * CAMINO FELIZ · #69 — un apellido devuelve mesa y menú, sin acentos.
   * CASO DE ERROR · un apellido que no existe lo dice claramente.
   */
  test("el buscador encuentra sin acentos y dice cuando no hay nadie", async ({ page }) => {
    const sembrado = await sembrar(Date.now() + 3);

    await entrar(page);
    await page.goto(RUTA_BUSCAR_DIA);

    const campo = page.getByLabel(copy.panel.dia.buscar.campo, { exact: true });

    // Sin escribir no se enseña a nadie: la pantalla no es una tabla.
    await expect(page.getByText(copy.panel.dia.buscar.escribeAlgo)).toBeVisible();

    // «gonzalez» —sin tilde y en minúsculas— encuentra a «González Ibáñez».
    await campo.fill("gonzalez");
    const ficha = page.locator("article").filter({ hasText: sembrado.invitado.apellidos });
    await expect(ficha).toBeVisible();
    await expect(ficha).toContainText(sembrado.invitado.mesa);
    await expect(ficha).toContainText(copy.rsvp.menus.sin_gluten);
    await expect(ficha).toContainText("Celíaca");

    // CASO DE ERROR: un apellido que no existe se dice con palabras.
    await campo.fill("apellidoquenoexiste");
    await expect(
      page.getByText(
        copy.panel.dia.buscar.sinResultados.replace("{texto}", "apellidoquenoexiste"),
      ),
    ).toBeVisible();
  });

  /**
   * CAMINO FELIZ · #70 — el recuento cuadra con la base y se puede corregir sin
   * tocar la confirmación de nadie.
   */
  test("el recuento cuenta lo confirmado y la corrección no toca a los invitados", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 4);

    await entrar(page);
    await page.goto(RUTA_RECUENTO);

    // La fila del menú que se ha sembrado existe y cuenta a alguien.
    const fila = page
      .locator("tr")
      .filter({ has: page.getByRole("rowheader", { name: copy.rsvp.menus.sin_gluten }) });
    await expect(fila).toBeVisible();

    /*
      `count(*)` ES `bigint` Y LLEGA COMO CADENA. No cabe entero en un número de
      JavaScript, así que el driver lo deja en texto — igual que los `numeric`
      del presupuesto. Aquí se ve poco («"2"» frente a `2`) y muerde después:
      `"2" - 1` da 1, pero `total` también viene en texto, y comparar `"1"` con
      `1` falla sin que el mensaje diga por qué. Se convierte al leer.
    */
    const confirmadosAntes = await conBase(async (sql) =>
      Number(
        (
          await sql<{ personas: string }[]>`
              select personas from public.v_menus_confirmados where tipo_menu = 'sin_gluten'
            `
        )[0]?.personas ?? 0,
      ),
    );
    await expect(fila).toContainText(String(confirmadosAntes));

    /*
      Y LA ALERGIA APARECE CON SU MESA, que es la mitad del dato: «dos celíacos»
      no le sirve a quien reparte platos.

      Se busca la fila entera y no «Celíaca» suelto: la base de pruebas tiene
      más invitados con alergias —los del seed—, así que la palabra sola sale
      varias veces y el localizador dejaría de ser único.
    */
    const suAlergia = page.locator("li").filter({ hasText: sembrado.invitado.apellidos });
    await expect(suAlergia).toContainText("Celíaca");
    await expect(suAlergia).toContainText(sembrado.invitado.mesa);

    // Se corrige a la baja: alguien ha fallado a última hora.
    await page.getByLabel(copy.panel.dia.recuento.campoMenu, { exact: true }).selectOption({
      label: copy.rsvp.menus.sin_gluten,
    });
    await page.getByLabel(copy.panel.dia.recuento.campoAjuste, { exact: true }).fill("-1");
    await page
      .getByLabel(copy.panel.dia.recuento.campoNota, { exact: true })
      .fill(`${MARCA} falla uno`);
    await page.getByRole("button", { name: copy.panel.dia.recuento.guardar }).click();
    await esperarEstado(page, "corregido");

    await expect(page.getByText(copy.panel.dia.avisos.corregido)).toBeVisible();

    /*
      LO QUE DE VERDAD SE PRUEBA: la corrección baja el total del catering y
      NO TOCA la confirmación de nadie. Es media razón de ser del módulo — quien
      dijo que venía dijo que venía, y ese dato es suyo.
    */
    const despues = await conBase(async (sql) => {
      const [recuento] = await sql<{ confirmados: string; ajuste: number; total: string }[]>`
        select confirmados, ajuste, total
          from public.v_recuento_catering where tipo_menu = 'sin_gluten'
      `;
      const [invitado] = await sql<{ estado: string }[]>`
        select f.estado from public.confirmaciones as f
        join public.invitados as i on i.id = f.invitado_id
        where i.apellidos = ${sembrado.invitado.apellidos} and f.es_vigente
      `;
      return {
        confirmados: Number(recuento.confirmados),
        ajuste: Number(recuento.ajuste),
        total: Number(recuento.total),
        estado: invitado.estado,
      };
    });

    expect(despues.ajuste, "la corrección tiene que haberse guardado").toBe(-1);
    expect(despues.confirmados, "los confirmados no los toca una corrección").toBe(
      confirmadosAntes,
    );
    expect(despues.total).toBe(confirmadosAntes - 1);
    expect(
      despues.estado,
      "corregir el recuento NO puede cambiar lo que contestó un invitado",
    ).toBe("confirmado");

    await conBase(
      (sql) => sql`delete from public.correcciones_recuento where tipo_menu = 'sin_gluten'`,
    );
  });

  /**
   * CAMINO FELIZ · Se corrige un menú que nadie ha pedido todavía.
   *
   * Es el caso para el que existe la corrección: dos niños que se presentan sin
   * haber contestado, cuando no hay ni un «Infantil» confirmado. El desplegable
   * sólo ofrecía los menús que ya tenían confirmados, así que no se podía.
   */
  test("se puede corregir un menú del que no hay ningún confirmado", async ({ page }) => {
    await sembrar(Date.now() + 7);

    // En la semilla no hay ningún «Infantil» confirmado; si algún día lo hay,
    // la cuenta sigue siendo la misma: lo confirmado más la corrección.
    const infantilesConfirmados = await conBase(async (sql) =>
      Number(
        (
          await sql<{ personas: string }[]>`
            select personas from public.v_menus_confirmados where tipo_menu = 'infantil'
          `
        )[0]?.personas ?? 0,
      ),
    );

    await entrar(page);
    await page.goto(RUTA_RECUENTO);

    await page.getByLabel(copy.panel.dia.recuento.campoMenu, { exact: true }).selectOption({
      label: copy.rsvp.menus.infantil,
    });
    await page.getByLabel(copy.panel.dia.recuento.campoAjuste, { exact: true }).fill("2");
    await page
      .getByLabel(copy.panel.dia.recuento.campoNota, { exact: true })
      .fill(`${MARCA} vienen dos niños sin contestar`);
    await page.getByRole("button", { name: copy.panel.dia.recuento.guardar }).click();
    await esperarEstado(page, "corregido");

    const [linea] = await conBase(
      (sql) => sql<{ total: string }[]>`
        select total from public.v_recuento_catering where tipo_menu = 'infantil'
      `,
    );
    expect(Number(linea?.total), "la línea del menú tiene que existir y sumar").toBe(
      infantilesConfirmados + 2,
    );

    await expect(
      page
        .locator("tr")
        .filter({ has: page.getByRole("rowheader", { name: copy.rsvp.menus.infantil }) }),
    ).toBeVisible();

    await conBase(
      (sql) => sql`delete from public.correcciones_recuento where tipo_menu = 'infantil'`,
    );
  });

  /**
   * CASO DE ERROR · Un porqué más largo de lo que admite la base lo dice.
   *
   * El campo ya corta al escribir; esto es lo que pasa si llega igual (otro
   * navegador, un formulario viejo en caché). Antes el `check` de la base lo
   * rechazaba y la pantalla pedía reintentar, que no iba a servir nunca.
   */
  test("una nota más larga de lo que cabe se explica y no se guarda", async ({ page }) => {
    await sembrar(Date.now() + 8);

    await entrar(page);
    await page.goto(RUTA_RECUENTO);

    const nota = page.getByLabel(copy.panel.dia.recuento.campoNota, { exact: true });
    const tope = Number(await nota.getAttribute("maxlength"));
    expect(tope, "el campo tiene que llevar el tope de la base").toBeGreaterThan(0);

    await page.getByLabel(copy.panel.dia.recuento.campoMenu, { exact: true }).selectOption({
      label: copy.rsvp.menus.vegano,
    });
    await page.getByLabel(copy.panel.dia.recuento.campoAjuste, { exact: true }).fill("1");
    await nota.evaluate((campo) => campo.removeAttribute("maxlength"));
    await nota.fill(`${MARCA} ${"x".repeat(tope)}`);
    await page.getByRole("button", { name: copy.panel.dia.recuento.guardar }).click();
    await esperarEstado(page, "nota-larga");

    await expect(page.getByText(copy.panel.dia.avisos.notaLarga)).toBeVisible();
    const guardadas = await conBase(
      (sql) => sql`
        select 1 from public.correcciones_recuento
         where tipo_menu = 'vegano' and nota like ${`${MARCA}%`}
      `,
    );
    expect(guardadas, "no se guarda nada").toHaveLength(0);
  });

  /**
   * CASO DE ERROR · Si no se pueden leer las alergias, no se afirma que no hay.
   *
   * «Nadie ha apuntado ninguna alergia» es una frase que se copia al catering.
   * Ante una lectura caída, la pantalla de avería con su «Reintentar». Se
   * simula quitándole a `authenticated` la vista, y se devuelve al acabar.
   */
  test("si las alergias no se pueden leer, no dice que nadie tiene alergias", async ({
    page,
  }) => {
    await entrar(page);

    try {
      await conBase(
        (sql) => sql`revoke select on public.v_alergias_por_mesa from authenticated`,
      );
      await page.goto(RUTA_RECUENTO);

      await expect(page.getByRole("heading", { name: copy.panel.errorTitulo })).toBeVisible();
      await expect(page.getByText(copy.panel.dia.recuento.alergiasVacio)).toHaveCount(0);
    } finally {
      await conBase((sql) => sql`grant select on public.v_alergias_por_mesa to authenticated`);
    }
  });

  /**
   * CASO DE ERROR · #70 — una corrección que no es un número se rechaza con
   * palabras en vez de guardar cualquier cosa.
   */
  test("una corrección que no es un número no se guarda", async ({ page }) => {
    await sembrar(Date.now() + 5);

    await entrar(page);
    await page.goto(RUTA_RECUENTO);

    await page.getByLabel(copy.panel.dia.recuento.campoAjuste, { exact: true }).fill("dos");
    await page.getByRole("button", { name: copy.panel.dia.recuento.guardar }).click();
    await esperarEstado(page, "ajuste-invalido");

    await expect(
      page.getByText(
        copy.panel.dia.avisos.ajusteInvalido.replaceAll(
          "{maximo}",
          String(AJUSTE_MAXIMO_RECUENTO),
        ),
      ),
    ).toBeVisible();
  });

  /**
   * CAMINO FELIZ · #71 — la hoja para imprimir sale ordenada por mesa, con el
   * menú y las alergias, la agenda de teléfonos y la hora de generación.
   */
  test("la hoja para llevarse trae mesas, menús, alergias, teléfonos y su hora", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 6);

    await entrar(page);
    await page.goto(RUTA_EXPORTAR_DIA);

    // La mesa, con su gente debajo.
    const seccion = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: sembrado.invitado.mesa }) });
    await expect(seccion).toContainText(sembrado.invitado.apellidos);
    await expect(seccion).toContainText(copy.rsvp.menus.sin_gluten);
    await expect(seccion).toContainText("Celíaca");

    // Los teléfonos del día, que es lo que pide el ticket que se lleve también.
    const contactos = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: copy.panel.dia.exportar.contactos }) });
    await expect(contactos).toContainText(sembrado.contratado);
    await expect(contactos).toContainText(sembrado.telefonoDelDia);

    /*
      LA HORA DE GENERACIÓN, VISIBLE. Es un criterio del ticket y no un adorno:
      esto es una foto fija, y quien lee la hoja impresa tiene que poder saber
      de cuándo es sin preguntar.
    */
    await expect(page.getByText(copy.panel.dia.exportar.esUnaFotoFija)).toBeVisible();
    await expect(page.getByText(/^Generado el /)).toBeVisible();
  });

  /**
   * QUIEN HA DICHO QUE NO NO OCUPA SILLA EN EL PAPEL, Y EL BUSCADOR LO DICE.
   *
   * Conserva su mesa —el reparto es de los novios—, pero salía en ella con
   * «No ha confirmado» y un menú al lado, igual que quien todavía no ha dicho
   * nada. Sobre ese papel se cuentan sillas y platos.
   */
  test("quien ha dicho que no sale aparte en el papel y el buscador lo distingue", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 9);
    const noViene = { nombre: "Rodrigo", apellidos: `Ausente Pérez ${sembrado.sello}` };
    const callada = { nombre: "Inés", apellidos: `Callada Ruiz ${sembrado.sello}` };

    await conBase(async (sql) => {
      const [suya] = await sql<{ mesa_id: string; grupo_id: string }[]>`
        select mesa_id, grupo_id from public.invitados
         where apellidos = ${sembrado.invitado.apellidos}
      `;
      const [persona] = await sql<{ id: string }[]>`
        insert into public.invitados (grupo_id, mesa_id, nombre, apellidos, tipo_menu)
        values (${suya.grupo_id}, ${suya.mesa_id}, ${noViene.nombre}, ${noViene.apellidos},
                'vegetariano')
        returning id
      `;
      await sql`
        insert into public.confirmaciones
          (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
        values (${persona.id}, 'rechazado', 'publico', null, null)
      `;
      // Y otra que no contesta: la base le deja su `pendiente` al darla de alta.
      await sql`
        insert into public.invitados (grupo_id, mesa_id, nombre, apellidos)
        values (${suya.grupo_id}, ${suya.mesa_id}, ${callada.nombre}, ${callada.apellidos})
      `;
    });

    await entrar(page);
    await page.goto(RUTA_EXPORTAR_DIA);

    const mesa = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: sembrado.invitado.mesa }) });
    await expect(mesa).toContainText(sembrado.invitado.apellidos);
    await expect(mesa, "quien dijo que no no ocupa silla en su mesa").not.toContainText(
      noViene.apellidos,
    );

    // Quien no ha contestado sigue en su mesa, marcado y sin un menú que no pidió.
    const filaCallada = mesa.locator("tr").filter({ hasText: callada.apellidos });
    await expect(filaCallada).toContainText(copy.panel.dia.buscar.sinConfirmar);
    await expect(filaCallada).not.toContainText(copy.rsvp.menus.estandar);

    const noVienen = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: copy.panel.dia.exportar.noVienen }) });
    await expect(noVienen).toContainText(noViene.apellidos);
    await expect(noVienen).not.toContainText(copy.rsvp.menus.vegetariano);

    // El buscador: la ficha lo dice antes que nada, y no le pone menú.
    await page.goto(RUTA_BUSCAR_DIA);
    const campo = page.getByLabel(copy.panel.dia.buscar.campo, { exact: true });

    await campo.fill("ausente");
    const fichaNo = page.locator("article").filter({ hasText: noViene.apellidos });
    await expect(fichaNo).toContainText(copy.panel.dia.buscar.noViene);
    await expect(fichaNo).not.toContainText(copy.panel.dia.buscar.sinConfirmar);
    await expect(fichaNo).not.toContainText(copy.rsvp.menus.vegetariano);

    await campo.fill("callada");
    const fichaCallada = page.locator("article").filter({ hasText: callada.apellidos });
    await expect(fichaCallada).toContainText(copy.panel.dia.buscar.sinConfirmar);
    await expect(fichaCallada).not.toContainText(copy.panel.dia.buscar.noViene);
  });
  /** Lo que la base tiene apuntado como hecho para un punto del guion. */
  const hechoEnDe = (titulo: string) =>
    conBase(
      async (sql) =>
        (
          await sql<{ hecho_en: string | null }[]>`
            select hecho_en from public.guion_dia where titulo = ${titulo}
          `
        )[0]?.hecho_en ?? null,
    );

  /**
   * CAMINO FELIZ · Lo marcado sin cobertura en otra visita se manda al abrir.
   *
   * El móvil se bloquea en el aparcamiento con una marca sin mandar y se abre
   * otra vez en la finca, con red. El navegador no dispara `online` —para él
   * nunca dejó de haberla—, y la cola sólo se mandaba con ese evento: la marca
   * se quedaba en el móvil hasta que alguien tocaba otro punto.
   *
   * CASO DE ERROR · en la misma cola va un punto que ya no existe: se dice, se
   * suelta y no se queda «sin mandar» para siempre.
   */
  test("lo que quedó sin mandar se manda al abrir la pantalla, sin esperar a la red", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 11);
    const id = await conBase(
      async (sql) =>
        (
          await sql<{ id: string }[]>`
            select id from public.guion_dia where titulo = ${sembrado.segundoPunto}
          `
        )[0].id,
    );
    const quitado = "00000000-0000-4000-8000-000000000000";

    await entrar(page);
    // Lo que dejó la visita anterior, tal cual lo guarda la pantalla.
    await page.evaluate(([clave, cola]) => window.localStorage.setItem(clave, cola), [
      CLAVE_ALMACEN_DIA,
      JSON.stringify({ [id]: new Date().toISOString(), [quitado]: new Date().toISOString() }),
    ] as const);
    await page.goto(RUTA_DIA);

    const punto = page.locator("li").filter({ hasText: sembrado.segundoPunto });
    await expect(punto).toHaveAttribute("data-hecho", "si");
    await expect
      .poll(() => hechoEnDe(sembrado.segundoPunto), { timeout: 20_000 })
      .not.toBeNull();

    await expect(page.getByText(copy.panel.dia.guion.noExiste)).toBeVisible();
    await expect(page.locator("[data-sin-mandar]")).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate((clave) => window.localStorage.getItem(clave), CLAVE_ALMACEN_DIA),
      )
      .toBe("{}");
  });

  /**
   * CAMINO FELIZ · Volver atrás desde «Teléfonos» no deshace lo marcado.
   *
   * El navegador vuelve con la página que tenía guardada, de antes de marcar.
   * Lo aceptado vivía en el componente y se perdía al desmontarlo: el punto
   * salía sin hacer aunque en la base estaba hecho.
   */
  test("volver atrás desde la agenda no deshace lo marcado", async ({ page }) => {
    const sembrado = await sembrar(Date.now() + 12);

    await entrar(page);
    await page.goto(RUTA_DIA);
    await page.waitForLoadState("networkidle");

    const punto = page.locator("li").filter({ hasText: sembrado.primerPunto });
    await punto
      .getByRole("button", {
        name: copy.panel.dia.guion.marcarEste.replace("{titulo}", sembrado.primerPunto),
      })
      .click();
    await expect
      .poll(() => hechoEnDe(sembrado.primerPunto), { timeout: 20_000 })
      .not.toBeNull();
    // Hasta que la cola no está vacía, la marca sigue pintándose desde ella.
    await expect
      .poll(() =>
        page.evaluate((clave) => window.localStorage.getItem(clave), CLAVE_ALMACEN_DIA),
      )
      .toBe("{}");

    await page.getByRole("link", { name: copy.panel.dia.atajos.agenda }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_AGENDA_DIA));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${RUTA_DIA}$`));

    await expect(page.locator("li").filter({ hasText: sembrado.primerPunto })).toHaveAttribute(
      "data-hecho",
      "si",
    );
  });

  /**
   * CASO DE ERROR · Con buena red pero un servidor lento, no se grita «sin
   * conexión». El aviso amarillo salía en cada toque mientras la petición iba
   * de camino, e invitaba a pulsar «Mandar ahora» y duplicarla.
   */
  test("mientras se guarda con red no dice que no hay conexión", async ({ page }) => {
    const sembrado = await sembrar(Date.now() + 13);

    await entrar(page);
    await page.goto(RUTA_DIA);
    await page.waitForLoadState("networkidle");

    await page.route(`**${RUTA_DIA}**`, async (ruta) => {
      if (ruta.request().method() !== "POST") return ruta.continue();
      await new Promise((listo) => setTimeout(listo, 2_000));
      return ruta.continue();
    });

    const punto = page.locator("li").filter({ hasText: sembrado.segundoPunto });
    await punto
      .getByRole("button", {
        name: copy.panel.dia.guion.marcarEste.replace("{titulo}", sembrado.segundoPunto),
      })
      .click();

    await expect(punto).toHaveAttribute("data-hecho", "si");
    await expect(page.getByText(copy.panel.dia.guion.guardando)).toBeVisible();
    await expect(page.locator("[data-sin-mandar]")).toHaveCount(0);

    await expect
      .poll(() => hechoEnDe(sembrado.segundoPunto), { timeout: 20_000 })
      .not.toBeNull();
    await expect(page.getByText(copy.panel.dia.guion.guardando)).toBeHidden();
    await page.unroute(`**${RUTA_DIA}**`);
  });

  /**
   * CAMINO FELIZ · Un punto sin orden va al final del guion de verdad.
   *
   * Vacío era un 99 fijo, y en un guion numerado de diez en diez el punto nuevo
   * caía entre el 90 y el 100: a media tarde. CASO DE ERROR · un orden negativo
   * no se guarda.
   */
  test("un punto sin orden va detrás del último, y uno negativo no entra", async ({ page }) => {
    const sembrado = await sembrar(Date.now() + 14);
    const titulo = `${MARCA} Al final ${sembrado.sello}`;
    const escribir = copy.panel.dia.escribir;

    await entrar(page);
    await page.goto(RUTA_GUION_DIA);

    const alta = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: escribir.nuevoTitulo }) });
    await alta.getByLabel(escribir.campoHora, { exact: true }).fill("de madrugada");
    await alta.getByLabel(escribir.campoTitulo, { exact: true }).fill(titulo);
    await alta.getByLabel(escribir.campoOrden, { exact: true }).fill("");
    await alta.getByRole("button", { name: escribir.anadir }).click();
    await esperarEstado(page, "creado");

    const { orden, maximo } = await conBase(async (sql) => {
      const [suyo] = await sql<{ orden: number }[]>`
        select orden from public.guion_dia where titulo = ${titulo}
      `;
      const [otros] = await sql<{ maximo: number }[]>`
        select max(orden) as maximo from public.guion_dia where titulo <> ${titulo}
      `;
      return { orden: suyo.orden, maximo: otros.maximo };
    });
    expect(orden, "vacío es «detrás del último», no un número fijo").toBe(maximo + 1);

    /*
      CASO DE ERROR: el servidor no se cree un orden que el campo no deja
      escribir. Se apaga la validación del navegador —que ya lo para— para que
      decida la acción, que es la que de verdad protege la base.
    */
    const otro = `${MARCA} Orden raro ${sembrado.sello}`;
    const campoOrden = alta.getByLabel(escribir.campoOrden, { exact: true });
    await alta.getByLabel(escribir.campoHora, { exact: true }).fill("23:00");
    await alta.getByLabel(escribir.campoTitulo, { exact: true }).fill(otro);
    await campoOrden.fill("-5");
    await campoOrden.evaluate((campo) =>
      (campo as HTMLInputElement).form?.setAttribute("novalidate", ""),
    );
    await alta.getByRole("button", { name: escribir.anadir }).click();
    await esperarEstado(page, "orden");
    expect(
      await conBase((sql) => sql`select 1 from public.guion_dia where titulo = ${otro}`),
    ).toHaveLength(0);
  });

  /**
   * CASO DE ERROR · Una corrección no deja un menú por debajo de cero.
   *
   * Elegir «Infantil» por error y escribir −2 se guardaba: la tabla decía
   * «Infantil · −2» y el mensaje del catering pedía menos dos menús.
   */
  test("una corrección que deja un menú por debajo de cero no se guarda", async ({ page }) => {
    await sembrar(Date.now() + 15);
    const confirmados = await conBase(async (sql) =>
      Number(
        (
          await sql<{ confirmados: string }[]>`
            select confirmados from public.v_recuento_catering where tipo_menu = 'sin_gluten'
          `
        )[0]?.confirmados ?? 0,
      ),
    );

    await entrar(page);
    await page.goto(RUTA_RECUENTO);
    await page
      .getByLabel(copy.panel.dia.recuento.campoMenu, { exact: true })
      .selectOption("sin_gluten");
    await page
      .getByLabel(copy.panel.dia.recuento.campoAjuste, { exact: true })
      .fill(String(-(confirmados + 1)));
    await page
      .getByLabel(copy.panel.dia.recuento.campoNota, { exact: true })
      .fill(`${MARCA} de más`);
    await page.getByRole("button", { name: copy.panel.dia.recuento.guardar }).click();
    await esperarEstado(page, "ajuste-bajo-cero");

    await expect(page.getByText(copy.panel.dia.avisos.ajusteBajoCero)).toBeVisible();
    expect(
      await conBase(
        (sql) =>
          sql`select 1 from public.correcciones_recuento where nota = ${`${MARCA} de más`}`,
      ),
      "no se guarda nada",
    ).toHaveLength(0);
  });

  /**
   * CAMINO FELIZ · Con una corrección, las cifras sueltas y el mensaje del
   * catering la dicen, y el desplegable enseña la que ya tiene cada menú.
   *
   * «44 adultos y 1 niño» con 47 menús encargados era lo que salía: las
   * tarjetas cuentan confirmaciones y el total lleva la corrección.
   */
  test("la corrección se dice junto a adultos y niños y en el mensaje del catering", async ({
    page,
  }) => {
    await sembrar(Date.now() + 16);
    await conBase(
      (sql) => sql`
        insert into public.correcciones_recuento (tipo_menu, ajuste, nota)
        values ('vegetariano', 2, ${`${MARCA} dos más`})
        on conflict (tipo_menu) do update set ajuste = excluded.ajuste, nota = excluded.nota
      `,
    );

    try {
      await entrar(page);
      await page.goto(RUTA_RECUENTO);

      const linea = copy.panel.dia.recuento.correccionTotal.replace("{ajuste}", "+2");
      await expect(page.getByText(linea, { exact: true })).toBeVisible();
      expect(await page.locator("#recuento-pegable").inputValue()).toContain(linea);

      await expect(
        page.getByLabel(copy.panel.dia.recuento.campoMenu, { exact: true }).locator("option", {
          hasText: copy.panel.dia.recuento.opcionConCorreccion
            .replace("{menu}", copy.panel.menus.vegetariano)
            .replace("{ajuste}", "+2"),
        }),
      ).toHaveCount(1);
    } finally {
      await conBase(
        (sql) => sql`delete from public.correcciones_recuento where tipo_menu = 'vegetariano'`,
      );
    }

    // CASO DE ERROR: sin corrección no se dice nada de ella.
    await page.reload();
    await expect(page.getByText(copy.panel.dia.recuento.correccionTotalAyuda)).toHaveCount(0);
  });

  /**
   * CAMINO FELIZ · La hoja se imprime sin el menú del panel encima.
   *
   * Imprimir sacaba la barra lateral en la primera hoja y la de pestañas al
   * pie, y la tabla se quedaba con medio folio. CASO DE ERROR · el botón de
   * imprimir no se imprime a sí mismo.
   */
  test("la hoja impresa no lleva la navegación del panel ni su propio botón", async ({
    page,
  }) => {
    await sembrar(Date.now() + 17);

    await entrar(page);
    await page.goto(RUTA_EXPORTAR_DIA);
    const imprimir = page.getByRole("button", { name: copy.panel.dia.exportar.imprimir });
    await expect(imprimir).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(imprimir).toBeHidden();
    await expect(page.locator("main table").first()).toBeVisible();
  });

  /**
   * CASO DE ERROR · La región que anuncia el buscador no lee la lista entera.
   *
   * La lista de fichas vivía dentro del `aria-live`: con cada letra el lector
   * de pantalla volvía a leer todos los resultados. Lo que se anuncia es el
   * número; las fichas se recorren aparte.
   */
  test("el buscador anuncia cuántos hay, no las fichas enteras", async ({ page }) => {
    const sembrado = await sembrar(Date.now() + 18);

    await entrar(page);
    await page.goto(RUTA_BUSCAR_DIA);
    await page.getByLabel(copy.panel.dia.buscar.campo, { exact: true }).fill("gonzalez ibanez");

    await expect(
      page.locator("article").filter({ hasText: sembrado.invitado.apellidos }),
    ).toBeVisible();
    // El de la pantalla: el anunciador de rutas de Next también es `aria-live`.
    const anuncio = page.locator("main [aria-live]");
    await expect(anuncio).toHaveCount(1);
    await expect(anuncio).not.toBeEmpty();
    await expect(anuncio.locator("article")).toHaveCount(0);
  });
});
