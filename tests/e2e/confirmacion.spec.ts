import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";

import { expect, origenDelTest, test, type Locator, type Page } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { LARGOS_DE_CAMPO, RUTA_INVITACION } from "../../src/config/constants";
import { conPlazoCerrado } from "./utiles/plazo";

/**
 * LA CONFIRMACIÓN, AL FINAL DE LA LANDING, DETRÁS DE VUESTRA ESTRELLA
 *
 * Lo último de la página es una estrella hueca que late. Con el enlace de la
 * invitación, tocarla despliega ahí mismo el formulario del grupo —quién
 * viene y, de quien viene, menú, alergias y autobús—, sin salir de la página:
 * lo demás de la boda sigue arriba. Al confirmar que viene alguien, la
 * estrella se enciende.
 *
 * El test no se conforma con la pantalla: después de enviar ABRE LA BASE y
 * mira qué quedó escrito. Un «qué alegría» que no escribe nada pasaría
 * cualquier test que sólo mire el HTML.
 *
 * SIN JAVASCRIPT el camino feliz: un `<details>` se abre solo y el formulario
 * es un `POST` por paso. Si alguien mete un `onClick` en el camino, se cae
 * aquí y no delante de un invitado con un móvil prestado.
 *
 * CADA TEST SE FABRICA SU GRUPO, con el proyecto en el nombre: escritorio y
 * móvil pueden correr a la vez y no se pisan.
 */

const cadena = process.env.DATABASE_URL;
const MARCA = "(DES) Grupo confirmar";
const MOVIL = { width: 390, height: 844 };

test.describe.configure({ mode: "serial" });

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

const marcaDelProyecto = () => `${MARCA} ${test.info().project.name}`;

/** Un grupo sin contestar, con su token. */
async function crearGrupo(
  sufijo: string,
  personas: string[],
): Promise<{ token: string; nombre: string }> {
  const proyecto = test.info().project.name;
  const token = `desarrollo-confirmar-${proyecto}-${sufijo}-000000`;
  const nombre = `${marcaDelProyecto()} ${sufijo}`;
  await conBase(async (sql) => {
    await sql`delete from public.grupos_invitacion where nombre = ${nombre}`;
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
      values (
        ${nombre}, 'ambos',
        array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
        public.huella_token(${token})
      )
      returning id
    `;
    for (const persona of personas) {
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        values (${grupo!.id}, ${persona}, '(DES)', false)
      `;
    }
  });
  return { token, nombre };
}

interface Guardado {
  nombre: string;
  estado: string;
  origen: string;
  necesita_autobus: boolean | null;
  tipo_menu: string;
  alergias: string | null;
}

/** Lo vigente de cada persona del grupo, por nombre. */
async function loGuardado(token: string): Promise<Guardado[]> {
  return conBase(
    (sql) => sql<Guardado[]>`
      select i.nombre, c.estado::text as estado, c.origen::text as origen,
             c.necesita_autobus, i.tipo_menu::text as tipo_menu, i.alergias
        from public.confirmaciones as c
        join public.invitados as i on i.id = c.invitado_id
        join public.grupos_invitacion as g on g.id = i.grupo_id
       where g.huella_token = public.huella_token(${token})
         and c.es_vigente
       order by i.nombre
    `,
  );
}

/**
 * Cuántas respuestas ha mandado el grupo desde la web, vigentes o no. Las de
 * `sistema` no cuentan: dar de alta a alguien ya le apunta un «pendiente».
 */
async function respuestasDelHistorico(token: string): Promise<number> {
  const [fila] = await conBase(
    (sql) => sql<{ total: number }[]>`
      select count(*)::int as total
        from public.confirmaciones as c
        join public.invitados as i on i.id = c.invitado_id
        join public.grupos_invitacion as g on g.id = i.grupo_id
       where g.huella_token = public.huella_token(${token})
         and c.origen = 'publico'
    `,
  );
  return fila?.total ?? 0;
}

async function correoDeContacto(): Promise<string> {
  const [fila] = await conBase(
    (sql) => sql<{ correo_contacto: string | null }[]>`
      select correo_contacto from public.configuracion_boda
    `,
  );
  if (!fila?.correo_contacto) throw new Error("El seed tiene que traer correo de contacto.");
  return fila.correo_contacto;
}

const confirmacion = (pagina: Page) => pagina.locator("#rsvp");

/** Abre el enlace de la invitación y toca la estrella. */
async function abrirConElEnlace(pagina: Page, token: string): Promise<Locator> {
  await pagina.goto(`${RUTA_INVITACION}/${token}`);
  expect(new URL(pagina.url()).pathname).toBe("/");
  const rsvp = confirmacion(pagina);
  await rsvp.locator("summary").click();
  await expect(rsvp.locator("details")).toHaveAttribute("open", "");
  return rsvp;
}

/** Marca «sí» o «no» a una persona del paso de asistencia. */
async function contestar(rsvp: Locator, persona: string, viene: boolean): Promise<void> {
  await rsvp
    .getByRole("group", { name: new RegExp(persona.replace(/[()]/g, "\\$&")) })
    .getByLabel(viene ? copy.rsvp.vieneSi : copy.rsvp.vieneNo)
    .check();
}

const botonAvanzar = (rsvp: Locator, rotulo: string) =>
  rsvp.getByRole("button", { name: rotulo, exact: true });

test.afterAll(async ({}, info) => {
  if (!cadena) return;
  const marca = `${MARCA} ${info.project.name}`;
  await conBase(
    (sql) => sql`delete from public.grupos_invitacion where nombre like ${`${marca}%`}`,
  );
});

test.describe("Vuestra estrella, sin enlace", () => {
  test("está plegada al final, se abre con el teclado y sólo explica cómo se confirma", async ({
    page,
  }) => {
    await page.goto("/");
    const rsvp = confirmacion(page);

    // Lo último de la página, después de todo lo que hay que saber.
    const ultima = await page.evaluate(
      () => [...document.querySelectorAll("main section[id]")].at(-1)?.id,
    );
    expect(ultima).toBe("rsvp");

    const details = rsvp.locator("details");
    await expect(details).not.toHaveAttribute("open", /.*/);
    await expect(rsvp.locator("summary")).toContainText(copy.rsvp.faltaVuestraEstrella);
    await expect(rsvp.locator('summary [data-vuestra-estrella="falta"]')).toHaveCount(1);

    // Un desplegable de verdad: con Intro se abre, como cualquier otro.
    await rsvp.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");

    await expect(rsvp).toContainText(copy.rsvp.comoSeConfirma);
    await expect(rsvp.locator("form, input, button")).toHaveCount(0);
  });

  test("con movimiento reducido, la estrella no late", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const onda = confirmacion(page).locator('[data-vuestra-estrella="falta"] .latido-estrella');
    await expect(onda).toHaveCount(1);
    expect(await onda.evaluate((nodo) => getComputedStyle(nodo).animationName)).toBe("none");
  });
});

test.describe("Confirmar con el enlace", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para fabricar la invitación.");

  test("se toca la estrella, se confirma sin JavaScript y queda en la base", async ({
    browser,
  }) => {
    const { token, nombre } = await crearGrupo("feliz", ["(DES) Aitor", "(DES) Bego"]);

    const contexto = await browser.newContext({
      viewport: MOVIL,
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenDelTest(),
    });
    const pagina = await contexto.newPage();

    const rsvp = await abrirConElEnlace(pagina, token);
    await expect(rsvp.getByText(copy.rsvp.saludo.replace("{grupo}", nombre))).toBeVisible();

    // Paso 1 · uno viene y el otro no.
    await contestar(rsvp, "(DES) Aitor", true);
    await contestar(rsvp, "(DES) Bego", false);
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();

    // Paso 2 · vuelve a la página con el desplegable abierto, y sólo quien viene.
    await expect(pagina).toHaveURL(/paso=detalles/);
    await expect(rsvp.locator("details")).toHaveAttribute("open", "");
    await expect(rsvp.getByText(copy.rsvp.pasoDetallesTitulo)).toBeVisible();
    await expect(rsvp.locator('select[name^="menu-"]')).toHaveCount(1);
    await rsvp.locator('select[name^="menu-"]').selectOption("vegano");
    await rsvp.locator('input[name^="alergias-"]').fill("(DES) Frutos secos");
    await rsvp.locator('input[name^="autobus-"]').check();
    await botonAvanzar(rsvp, copy.rsvp.enviar).click();

    // Hecho: el gracias, y la estrella encendida.
    await expect(pagina).toHaveURL(/enviado=1/);
    await expect(rsvp).toContainText(copy.rsvp.graciasSi);
    await expect(rsvp.locator('summary [data-vuestra-estrella="encendida"]')).toHaveCount(1);
    await expect(rsvp.locator("summary")).toContainText(copy.rsvp.estrellaEncendida);

    // LO QUE PIDIÓ PALOMA: nadie pierde la información de la boda por confirmar.
    await expect(pagina.locator("#portada")).toHaveCount(1);
    await expect(pagina.locator("#programa")).toHaveCount(1);
    await expect(pagina.locator("#transporte")).toHaveCount(1);

    // Y el token no viaja en la página: sólo en la cookie.
    expect(await pagina.content()).not.toContain(token);

    // LO QUE DE VERDAD IMPORTA: qué quedó escrito.
    const [aitor, bego] = await loGuardado(token);
    expect(aitor?.estado).toBe("confirmado");
    expect(aitor?.necesita_autobus).toBe(true);
    expect(aitor?.tipo_menu).toBe("vegano");
    expect(aitor?.alergias).toBe("(DES) Frutos secos");
    expect(bego?.estado).toBe("rechazado");
    expect(bego?.necesita_autobus).toBeNull();
    // El origen lo pone la base, no la petición.
    expect(aitor?.origen).toBe("publico");

    // Al volver otro día: plegada, encendida, y dentro lo contestado.
    await pagina.goto("/");
    await expect(rsvp.locator("details")).not.toHaveAttribute("open", /.*/);
    await expect(rsvp.locator("summary")).toContainText(copy.rsvp.tocadParaVer);
    await rsvp.locator("summary").click();
    await expect(rsvp).toContainText(copy.rsvp.resumenNoVienen);

    await contexto.close();
  });

  test("si no viene nadie, no se pregunta por el menú y la estrella sigue hueca", async ({
    page,
  }) => {
    const { token } = await crearGrupo("nadie", ["(DES) Ciro", "(DES) Dora"]);
    const rsvp = await abrirConElEnlace(page, token);

    await contestar(rsvp, "(DES) Ciro", false);
    await contestar(rsvp, "(DES) Dora", false);
    // De entrada el botón dice «Siguiente»; con todos en «no» ya no hay más
    // pasos, y ese mismo botón envía.
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();

    await expect(page).toHaveURL(/enviado=1/);
    await expect(rsvp).toContainText(copy.rsvp.graciasNo);
    await expect(rsvp.locator('summary [data-vuestra-estrella="falta"]')).toHaveCount(1);

    const guardado = await loGuardado(token);
    expect(guardado.map((fila) => fila.estado)).toEqual(["rechazado", "rechazado"]);
    expect(guardado.every((fila) => fila.necesita_autobus === null)).toBe(true);
  });

  test("cambiar la respuesta abre lo contestado, y la anterior queda en el histórico", async ({
    page,
  }) => {
    const { token } = await crearGrupo("cambio", ["(DES) Eva"]);
    let rsvp = await abrirConElEnlace(page, token);
    await contestar(rsvp, "(DES) Eva", true);
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();
    await expect(page).toHaveURL(/paso=detalles/);
    await botonAvanzar(rsvp, copy.rsvp.enviar).click();
    await expect(rsvp).toContainText(copy.rsvp.graciasSi);

    rsvp = confirmacion(page);
    await rsvp.getByRole("button", { name: copy.rsvp.editarRespuesta }).click();
    await expect(page).toHaveURL(/paso=asistencia/);
    // Sembrado con lo que hay en la base: no un formulario en blanco.
    await expect(
      rsvp.getByRole("group", { name: /Eva/ }).getByLabel(copy.rsvp.vieneSi),
    ).toBeChecked();

    await contestar(rsvp, "(DES) Eva", false);
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();
    await expect(page).toHaveURL(/enviado=1/);
    await expect(rsvp).toContainText(copy.rsvp.graciasNo);

    const [eva] = await loGuardado(token);
    expect(eva?.estado).toBe("rechazado");
    expect(await respuestasDelHistorico(token)).toBe(2);
  });

  /** CASO DE ERROR · nadie se queda sin contestar sin que se diga quién. */
  test("sin contestar por alguien no se avanza, se señala quién y lo marcado se queda", async ({
    page,
  }) => {
    const { token } = await crearGrupo("falta", ["(DES) Fede", "(DES) Gala"]);
    const rsvp = await abrirConElEnlace(page, token);

    await contestar(rsvp, "(DES) Fede", true);
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();

    await expect(page).toHaveURL(/paso=asistencia&falta=/);
    const gala = rsvp.getByRole("group", { name: /Gala/ });
    await expect(gala.getByRole("alert")).toHaveText(
      copy.rsvp.errorSinRespuesta.replace("{nombre}", "(DES) Gala"),
    );
    // El aviso va atado a sus opciones, para quien lo oye en vez de verlo.
    await expect(gala.getByLabel(copy.rsvp.vieneSi)).toHaveAttribute(
      "aria-describedby",
      /falta-/,
    );
    await expect(
      rsvp.getByRole("group", { name: /Fede/ }).getByLabel(copy.rsvp.vieneSi),
    ).toBeChecked();

    expect(await respuestasDelHistorico(token)).toBe(0);
  });

  /** CASO DE ERROR · lo que no cabe se dice antes de tocar la base. */
  test("unas alergias que no caben se avisan, no se escribe nada y el texto sigue", async ({
    page,
  }) => {
    const { token } = await crearGrupo("largo", ["(DES) Hugo"]);
    const rsvp = await abrirConElEnlace(page, token);
    await contestar(rsvp, "(DES) Hugo", true);
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();
    await expect(page).toHaveURL(/paso=detalles/);

    // El `maxlength` lo quita cualquiera; quien manda es el servidor.
    const alergias = rsvp.locator('input[name^="alergias-"]');
    await alergias.evaluate((campo) => campo.removeAttribute("maxlength"));
    const largo = "(DES) ".padEnd(LARGOS_DE_CAMPO["invitados.alergias"] + 1, "a");
    await alergias.fill(largo);
    await botonAvanzar(rsvp, copy.rsvp.enviar).click();

    await expect(page).toHaveURL(/largo=alergias/);
    await expect(rsvp.getByRole("alert")).toHaveText(copy.rsvp.demasiadoLargo);
    await expect(rsvp.locator('input[name^="alergias-"]')).toHaveValue(largo);
    expect(await respuestasDelHistorico(token)).toBe(0);
  });

  /** CASO DE ERROR · un enlace que dejó de valer no enseña un formulario muerto. */
  test("si el enlace deja de valer, la estrella lo dice y no hay formulario", async ({
    page,
  }) => {
    const { token, nombre } = await crearGrupo("borrado", ["(DES) Iris"]);
    await page.goto(`${RUTA_INVITACION}/${token}`);
    await conBase((sql) => sql`delete from public.grupos_invitacion where nombre = ${nombre}`);

    await page.goto("/");
    const rsvp = confirmacion(page);
    await rsvp.locator("summary").click();
    await expect(rsvp.getByRole("alert")).toHaveText(copy.rsvp.avisoEnlaceNoValido);
    await expect(rsvp.locator("form")).toHaveCount(0);
  });

  /** CASO DE ERROR · con el plazo cerrado no se confirma, y se dice a quién escribir. */
  test("con el plazo cerrado no hay formulario, y se dice a quién escribir", async ({
    page,
  }) => {
    const { token } = await crearGrupo("plazo", ["(DES) Juan"]);
    const correo = await correoDeContacto();

    await conPlazoCerrado(async () => {
      const rsvp = await abrirConElEnlace(page, token);
      await expect(rsvp).toContainText(copy.rsvp.plazoCerrado);
      await expect(rsvp.locator("form")).toHaveCount(0);
      await expect(rsvp.getByRole("link", { name: correo })).toHaveAttribute(
        "href",
        `mailto:${correo}`,
      );
    });
    expect(await respuestasDelHistorico(token)).toBe(0);
  });

  /** CASO DE ERROR · con el cupo agotado se pide esperar, no se da por roto. */
  test("con el cupo de intentos agotado, la estrella pide esperar unos minutos", async ({
    page,
    request,
  }) => {
    const { token } = await crearGrupo("cupo", ["(DES) Kira"]);
    await page.goto(`${RUTA_INVITACION}/${token}`);

    const [fila] = await conBase(
      (sql) => sql<{ maximo: number }[]>`
        select maximo_intentos_rsvp::int as maximo from public.parametros_seguridad
      `,
    );
    // Desde el mismo origen que la página: el cupo se cuenta por origen.
    for (let i = 0; i < fila!.maximo; i += 1) {
      await request.get(`${RUTA_INVITACION}/enlace-que-no-existe-${i}-000000`, {
        maxRedirects: 0,
      });
    }

    await page.goto("/");
    const rsvp = confirmacion(page);
    await rsvp.locator("summary").click();
    await expect(rsvp.getByRole("alert")).toHaveText(copy.rsvp.demasiadosIntentos);
  });

  test("el formulario abierto no tiene fallos graves de accesibilidad", async ({ page }) => {
    const { token } = await crearGrupo("axe", ["(DES) Leo", "(DES) Mar"]);
    const rsvp = await abrirConElEnlace(page, token);
    await contestar(rsvp, "(DES) Leo", true);
    await botonAvanzar(rsvp, copy.rsvp.siguiente).click();
    await expect(page).toHaveURL(/falta=/);

    const resultado = await new AxeBuilder({ page }).include("#rsvp").analyze();
    const graves = resultado.violations
      .filter((violacion) => violacion.impact === "critical" || violacion.impact === "serious")
      .map(
        (violacion) => `${violacion.id}: ${violacion.nodes.map((n) => n.target).join(", ")}`,
      );
    expect(graves).toEqual([]);
  });
});
