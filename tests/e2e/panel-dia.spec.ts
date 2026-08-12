import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_AGENDA_DIA,
  RUTA_BUSCAR_DIA,
  RUTA_DIA,
  RUTA_EXPORTAR_DIA,
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

    // El descartado existe para comprobar que NO sale: es el caso de error de #68.
    await sql`
      insert into public.proveedores (categoria_id, nombre, estado, telefono)
      values (${categoria.id}, ${descartado}, 'descartado', ${"+34 911 111 111"})
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
      SE CONFIRMA DE VERDAD, y no se toca la confirmación inicial a mano: la
      base crea una `pendiente` al dar de alta al invitado, así que confirmarlo
      es actualizar la vigente. Sembrarlo de otro modo probaría un estado que
      la aplicación no produce nunca.
    */
    await sql`
      update public.confirmaciones set estado = 'confirmado'
       where invitado_id = ${persona.id} and es_vigente
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

test.afterAll(async () => {
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
  });
});

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

    // Y tras recargar sigue marcado, que es el criterio literal del ticket.
    await page.reload();
    await expect(page.locator("li").filter({ hasText: sembrado.primerPunto })).toHaveAttribute(
      "data-hecho",
      "si",
    );
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
    const llamar = page.getByRole("link", {
      name: copy.panel.dia.agenda.llamarA.replace("{nombre}", "Rocío"),
    });
    await expect(llamar).toHaveAttribute(
      "href",
      `tel:${sembrado.telefonoDelDia.replace(/[^\d+]/g, "")}`,
    );
    // Y se lee el número tal cual, para poder dictarlo.
    await expect(llamar).toHaveText(sembrado.telefonoDelDia);

    // El contacto del día va marcado: es a quien hay que llamar.
    await expect(page.getByText(copy.panel.dia.agenda.contactoDelDia)).toBeVisible();

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

    const confirmadosAntes = await conBase(
      async (sql) =>
        (
          await sql<{ personas: number }[]>`
            select personas from public.v_menus_confirmados where tipo_menu = 'sin_gluten'
          `
        )[0]?.personas ?? 0,
    );
    await expect(fila).toContainText(String(confirmadosAntes));

    // Y la alergia aparece con su mesa, que es la mitad del dato.
    await expect(page.getByText("Celíaca")).toBeVisible();
    await expect(page.getByText(sembrado.invitado.mesa)).toBeVisible();

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
      const [recuento] = await sql<{ confirmados: number; ajuste: number; total: number }[]>`
        select confirmados, ajuste, total
          from public.v_recuento_catering where tipo_menu = 'sin_gluten'
      `;
      const [invitado] = await sql<{ estado: string }[]>`
        select f.estado from public.confirmaciones as f
        join public.invitados as i on i.id = f.invitado_id
        where i.apellidos = ${sembrado.invitado.apellidos} and f.es_vigente
      `;
      return { recuento, invitado };
    });

    expect(despues.recuento.ajuste, "la corrección tiene que haberse guardado").toBe(-1);
    expect(despues.recuento.confirmados, "los confirmados no los toca una corrección").toBe(
      confirmadosAntes,
    );
    expect(despues.recuento.total).toBe(confirmadosAntes - 1);
    expect(
      despues.invitado.estado,
      "corregir el recuento NO puede cambiar lo que contestó un invitado",
    ).toBe("confirmado");

    await conBase(
      (sql) => sql`delete from public.correcciones_recuento where tipo_menu = 'sin_gluten'`,
    );
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

    await expect(page.getByText(copy.panel.dia.avisos.ajusteInvalido)).toBeVisible();
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
});
