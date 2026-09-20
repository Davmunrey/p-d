import { createServer, type Server } from "node:http";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_RSVP } from "../../src/config/constants";

/**
 * BODA-57 · Correo de confirmación al invitado
 *
 * EL BUZÓN DE CAPTURA NO ES UN MOCK. Es un servidor HTTP de verdad escuchando
 * en el puerto al que apunta `RESEND_URL` durante los tests: la aplicación hace
 * su petición real, con su cabecera de autorización y su cuerpo JSON, y aquí se
 * lee exactamente lo que salió. Simular `enviarCorreo()` probaría que sabemos
 * llamar a nuestra propia función; esto prueba que el correo sale y qué lleva.
 *
 * El caso de error —proveedor caído— no necesita nada: el puerto está cerrado
 * por defecto en toda la suite, así que basta con no levantar el buzón.
 */

const cadena = process.env.DATABASE_URL;
const PUERTO_BUZON = 54999;
/** El mismo origen con el que arranca la web (playwright.config.ts). */
const URL_SITIO =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  "http://localhost:3000";

/**
 * CADA CONTEXTO, CON SU PROPIO ORIGEN.
 *
 * El cortafuegos del RSVP cuenta intentos fallidos por origen, y toda la suite
 * sale de `127.0.0.1`: los tests que abren enlaces inválidos a propósito
 * —«un enlace que no vale», la rotación de tokens— gastan ese cupo, y cuando le
 * toca el turno a este fichero la IP puede estar cerrada. Entonces el enlace no
 * se abre y el test falla por algo que no tiene nada que ver con el correo.
 *
 * Pasó. Con una cabecera propia, este fichero tiene su cupo entero y no se lo
 * gasta nadie. No se relaja el límite: se deja de compartir el cubo.
 */
let siguienteOrigen = 0;
const origen = () => ({ "x-forwarded-for": `198.51.100.${(siguienteOrigen += 1) + 100}` });

interface CorreoCapturado {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

const recibidos: CorreoCapturado[] = [];
let buzon: Server | undefined;

async function levantarBuzon(): Promise<void> {
  recibidos.length = 0;
  buzon = createServer((peticion, respuesta) => {
    let cuerpo = "";
    peticion.on("data", (trozo) => (cuerpo += trozo));
    peticion.on("end", () => {
      try {
        recibidos.push(JSON.parse(cuerpo) as CorreoCapturado);
      } catch {
        // Un cuerpo ilegible es un fallo del test, no del envío: se ignora
        // aquí y lo delata la comprobación de que no llegó nada.
      }
      respuesta.writeHead(200, { "content-type": "application/json" });
      respuesta.end(JSON.stringify({ id: "correo-de-pruebas" }));
    });
  });

  await new Promise<void>((listo) => buzon!.listen(PUERTO_BUZON, "127.0.0.1", listo));
}

/**
 * Un buzón que acepta la conexión y NO CONTESTA NUNCA: el incidente de latencia
 * del proveedor. Es el caso que el plazo del `fetch` existe para cubrir.
 */
async function levantarBuzonMudo(): Promise<void> {
  recibidos.length = 0;
  buzon = createServer((peticion) => {
    // Se lee el cuerpo y no se responde: la conexión se queda abierta.
    peticion.on("data", () => {});
  });

  await new Promise<void>((listo) => buzon!.listen(PUERTO_BUZON, "127.0.0.1", listo));
}

async function bajarBuzon(): Promise<void> {
  if (!buzon) return;
  // Las conexiones que el buzón mudo dejó colgadas, fuera: `close` esperaría.
  buzon.closeAllConnections();
  await new Promise<void>((listo) => buzon!.close(() => listo()));
  buzon = undefined;
}

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** Un grupo sin contestar. Con correo en la ficha, o sin él. */
async function crearGrupo(sufijo: string, correo: string | null): Promise<string> {
  const token = `desarrollo-correo-${sufijo}-000000`;
  await conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, huella_token)
      values (${`(DES) Correo ${sufijo}`}, public.huella_token(${token}))
      returning id
    `;
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos, correo_electronico)
      values (${grupo.id}, ${`(DES) Persona ${sufijo}`}, '(DES)', ${correo})
    `;
  });
  return token;
}

async function contarConfirmados(token: string): Promise<number> {
  const [fila] = await conBase(
    (sql) => sql<{ cuantos: number }[]>`
      select count(*)::int as cuantos
        from public.confirmaciones as c
        join public.invitados as i on i.id = c.invitado_id
        join public.grupos_invitacion as g on g.id = i.grupo_id
       where g.huella_token = public.huella_token(${token})
         and c.es_vigente
         and c.estado = 'confirmado'
    `,
  );
  return fila.cuantos;
}

test.describe.configure({ mode: "serial" });

test.describe("El acuse de recibo", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL.");

  test.afterEach(async () => {
    await bajarBuzon();
  });

  test("al confirmar sale el correo, con lo respondido y el enlace para cambiarlo", async ({
    browser,
  }) => {
    await levantarBuzon();

    const correo = `invitada-${Date.now()}@ejemplo.test`;
    const token = await crearGrupo(`feliz-${Date.now()}`, correo);

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origen(),
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    // El envío va después de redirigir, así que se espera a que llegue.
    await expect(() => expect(recibidos).toHaveLength(1)).toPass({ timeout: 10_000 });

    const [enviado] = recibidos;
    expect(enviado.to).toContain(correo);
    expect(enviado.subject).toBe(copy.correoConfirmacion.asuntoSi);

    // Lleva quién viene, el enlace para cambiarlo y la fecha límite. El enlace
    // ABSOLUTO: uno relativo no abre desde ningún cliente de correo, y pasaba
    // igual la comprobación de «contiene /rsvp/<token>».
    const enlace = `${URL_SITIO}${RUTA_RSVP}/${token}`;
    expect(enviado.html).toContain("(DES) Persona");
    expect(enviado.html).toContain(`href="${enlace}"`);

    // Y la misma carta en texto plano, que no es un extra: hay clientes que no
    // pintan HTML, y un correo sin ella tiene más papeletas de acabar en spam.
    expect(enviado.text).toContain(enlace);
    expect(enviado.text).toContain(copy.correoConfirmacion.despedida);
    expect(enviado.text).not.toContain("<p>");
  });

  /**
   * CASO DE ERROR · CON EL PROVEEDOR CAÍDO, LA RESPUESTA SE GUARDA IGUAL.
   *
   * No se levanta el buzón: el puerto de `RESEND_URL` está cerrado, así que la
   * petición falla de verdad. Es el criterio del ticket, y el que de verdad
   * protege algo: un acuse de recibo no puede costar una confirmación.
   */
  test("con el proveedor caído, la confirmación se guarda igual", async ({ browser }) => {
    const token = await crearGrupo(`caido-${Date.now()}`, `caido-${Date.now()}@ejemplo.test`);

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origen(),
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();

    // El invitado ve lo de siempre: ya ha contestado, y que el acuse no salga
    // no es un problema suyo ni puede resolverlo.
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    // Y lo que importa está en la base.
    expect(await contarConfirmados(token)).toBe(1);
  });

  /**
   * CASO DE ERROR · Sin correo en la ficha no se intenta, y no es un fallo.
   */
  /**
   * CASO DE ERROR · CON EL PROVEEDOR COLGADO, EL INVITADO NO SE QUEDA COLGADO.
   *
   * Resend acepta la conexión y no contesta. Sin plazo, el `fetch` esperaba
   * cinco minutos, la función de Vercel se agotaba antes y el invitado recibía
   * un 504 con su respuesta YA guardada: creía que no, volvía atrás y a la
   * segunda salían dos acuses. Con `PLAZO_CORREO_MS`, ve «¡Qué alegría!» en
   * segundos y la confirmación está en la base.
   */
  test("con el proveedor colgado, el invitado ve la confirmación en segundos", async ({
    browser,
  }) => {
    await levantarBuzonMudo();

    const token = await crearGrupo(`mudo-${Date.now()}`, `mudo-${Date.now()}@ejemplo.test`);

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origen(),
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    const desde = Date.now();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi, {
      timeout: 25_000,
    });
    // Muy por debajo del tiempo que se agota una función de Vercel.
    expect(Date.now() - desde).toBeLessThan(25_000);
    await contexto.close();

    expect(await contarConfirmados(token)).toBe(1);
  });

  /**
   * CASO DE ERROR · DOS TOQUES EN «ENVIAR» MANDAN UN SOLO ACUSE.
   *
   * Con JavaScript, `<form action>` no bloquea un segundo envío mientras el
   * primero está en vuelo: dos toques en un móvil con conexión lenta
   * despachaban la acción dos veces y salían dos correos idénticos. El botón
   * se apaga mientras la acción corre.
   */
  test("dos toques en enviar mandan un solo acuse y guardan una sola respuesta", async ({
    browser,
  }) => {
    await levantarBuzon();

    const correo = `doble-${Date.now()}@ejemplo.test`;
    const token = await crearGrupo(`doble-${Date.now()}`, correo);

    // CON JavaScript: es donde el doble toque se puede parar.
    const contexto = await browser.newContext({ locale: "es-ES", extraHTTPHeaders: origen() });
    const pagina = await contexto.newPage();
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(pagina.getByText(copy.rsvp.pasoDetallesTitulo)).toBeVisible();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(pagina.getByText(copy.rsvp.pasoMensajeTitulo)).toBeVisible();

    await pagina.getByRole("button", { name: copy.rsvp.enviar }).dblclick();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    await expect(() => expect(recibidos.length).toBeGreaterThan(0)).toPass({ timeout: 10_000 });
    // Un respiro por si el segundo envío llegara tarde: no tiene que llegar.
    await new Promise((listo) => setTimeout(listo, 1_500));
    expect(recibidos, "un solo acuse").toHaveLength(1);

    const [{ cuantas }] = await conBase(
      (sql) => sql<{ cuantas: number }[]>`
        select count(*)::int as cuantas
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token})
           and c.estado = 'confirmado'
      `,
    );
    expect(cuantas, "una sola respuesta registrada").toBe(1);
  });

  test("sin correo en la ficha no se manda nada, y la respuesta se guarda", async ({
    browser,
  }) => {
    await levantarBuzon();

    const token = await crearGrupo(`sin-correo-${Date.now()}`, null);

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origen(),
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    expect(await contarConfirmados(token)).toBe(1);

    // El buzón está levantado y escuchando: si llegara algo, sería a una
    // dirección que nadie ha escrito.
    expect(recibidos, "sin correo en la ficha no se manda nada").toHaveLength(0);
  });
});
