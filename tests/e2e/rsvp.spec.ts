import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_RSVP } from "../../src/config/constants";
import { conPlazoCerrado } from "./utiles/plazo";

/**
 * BODA-55 · Confirmación de asistencia
 *
 * La pantalla más importante del proyecto, así que el test tampoco se conforma
 * con mirar la pantalla: recorre el formulario entero y luego **abre la base de
 * datos** a comprobar qué quedó guardado. Un RSVP que enseña «qué alegría» y no
 * escribe nada pasaría cualquier test que sólo mire el HTML.
 *
 * SIN JAVASCRIPT, que es el requisito duro de este ticket. El recorrido feliz
 * se hace con `javaScriptEnabled: false`: si algún día alguien mete un
 * `onClick` en el camino, este test se cae y no un invitado de ochenta años
 * delante de un móvil prestado.
 *
 * CADA TEST SE FABRICA SU PROPIO GRUPO. Los del seed ya han contestado, y
 * reutilizarlos ataría estos tests al orden en que corren.
 */

const cadena = process.env.DATABASE_URL;

test.describe.configure({ mode: "serial" });

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** El correo de contacto que hay en la base, que es el que tiene que salir. */
async function correoDeContacto(): Promise<string> {
  const [fila] = await conBase(
    (sql) => sql<{ correo_contacto: string | null }[]>`
      select correo_contacto from public.configuracion_boda
    `,
  );
  if (!fila?.correo_contacto) throw new Error("El seed tiene que traer correo de contacto.");
  return fila.correo_contacto;
}

/** Crea un grupo sin contestar y devuelve su token. */
async function crearGrupo(sufijo: string, personas: string[]): Promise<string> {
  const token = `desarrollo-e2e-${sufijo}-000000`;
  await conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
      values (
        ${`(DES) Grupo ${sufijo}`}, 'ambos',
        array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
        public.huella_token(${token})
      )
      returning id
    `;
    for (const nombre of personas) {
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        values (${grupo.id}, ${nombre}, '(DES)', false)
      `;
    }
  });
  return token;
}

/**
 * Los grupos de prueba se borran al acabar. `confirmaciones` es un histórico
 * inmutable —hay un trigger que impide tocarlo— pero el borrado en cascada
 * desde el grupo sí está permitido, y es lo que deja la base como estaba.
 */
test.afterAll(async () => {
  if (!cadena) return;
  await conBase(
    (sql) => sql`delete from public.grupos_invitacion where nombre like '(DES) Grupo e2e-%'`,
  );
});

test.describe("El recorrido del invitado", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para fabricar la invitación.");

  test("confirma, guarda en la base y lo cuenta al volver", async ({ browser }) => {
    const token = await crearGrupo("e2e-feliz", ["(DES) Aitor", "(DES) Bego"]);

    // Móvil y SIN JavaScript: el camino que no se puede permitir fallar.
    const contexto = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
      locale: "es-ES",
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await expect(pagina.getByRole("heading", { level: 1 })).toContainText("(DES) Grupo");

    // Paso 1 · uno viene y el otro no.
    const opciones = pagina.locator('input[type="radio"]');
    await opciones.nth(0).check();
    await opciones.nth(3).check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Paso 2 · sólo aparece quien viene.
    await expect(pagina.getByText(copy.rsvp.pasoDetallesTitulo)).toBeVisible();
    await expect(pagina.locator('select[name^="menu-"]')).toHaveCount(1);
    await pagina.locator('select[name^="menu-"]').selectOption("vegano");
    await pagina.locator('input[name^="alergias-"]').fill("(DES) Frutos secos");
    await pagina.locator('input[type="checkbox"]').check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Paso 3 · lo opcional.
    await pagina.locator('input[name="cancion"]').fill("(DES) Una canción E2E");
    await pagina.locator('textarea[name="mensaje"]').fill("(DES) Nos vemos allí.");
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();

    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await expect(pagina.getByText("(DES) Aitor")).toBeVisible();

    // LO QUE DE VERDAD IMPORTA: qué quedó escrito.
    const guardado = await conBase(
      (sql) => sql<
        {
          nombre: string;
          estado: string;
          origen: string;
          necesita_autobus: boolean | null;
          tipo_menu: string;
          alergias: string | null;
          cancion_solicitada: string | null;
          mensaje: string | null;
        }[]
      >`
        select i.nombre, c.estado, c.origen, c.necesita_autobus,
               i.tipo_menu, i.alergias, c.cancion_solicitada, c.mensaje
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token})
           and c.es_vigente
         order by i.nombre
      `,
    );

    expect(guardado).toHaveLength(2);
    const [aitor, bego] = guardado;

    expect(aitor.estado).toBe("confirmado");
    expect(aitor.necesita_autobus).toBe(true);
    // El menú y las alergias no viven en la confirmación sino en la persona:
    // si esto vuelve a `estandar`, el formulario está tirando la respuesta.
    expect(aitor.tipo_menu).toBe("vegano");
    expect(aitor.alergias).toContain("Frutos secos");
    expect(aitor.cancion_solicitada).toContain("canción E2E");
    expect(aitor.mensaje).toContain("Nos vemos allí");

    expect(bego.estado).toBe("rechazado");
    // El origen lo fija la base, no la petición. Si alguna vez llega `panel`
    // desde aquí, alguien ha abierto una puerta que no debía.
    expect(bego.origen).toBe("publico");

    /*
      Y la canción llega a la PLAYLIST, que es otra tabla.

      `confirmaciones.cancion_solicitada` guarda lo que pidió esa persona; la
      sección de playlist de la landing lee `canciones_sugeridas`, que es la
      lista que sonará esa noche. Sin escribir en las dos, el invitado veía
      «guardado» y la playlist seguía vacía sin que nada fallara.
    */
    const enLaPlaylist = await conBase(
      (sql) => sql<{ texto: string }[]>`
        select c.texto
          from public.canciones_sugeridas as c
          join public.grupos_invitacion as g on g.id = c.grupo_id
         where g.huella_token = public.huella_token(${token})
      `,
    );
    expect(enLaPlaylist.map((fila) => fila.texto)).toContain("(DES) Una canción E2E");

    // Y al volver, la página cuenta lo que hay guardado en lugar de pedirlo otra vez.
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await expect(pagina.getByText(copy.rsvp.resumenNoVienen)).toBeVisible();

    await contexto.close();
  });

  /**
   * CASO DE ERROR · La cookie del borrador no puede ir marcada `Secure` si la
   * página no se está sirviendo por HTTPS.
   *
   * Este test existe porque el fallo ya pasó. La cookie se marcaba según
   * `NODE_ENV`, así que una compilación de producción servida por `http` —los
   * tests E2E, y cualquier despliegue interno sin TLS— la mandaba protegida.
   * Chromium la guardaba igual, porque trata `http://localhost` como contexto
   * seguro; **Safari la descartaba en silencio** y el RSVP se quedaba clavado
   * en el primer paso sin un solo error. Safari en el móvil es exactamente el
   * navegador de esta pantalla.
   */
  test("el borrador no se marca Secure sobre http", async ({ browser, baseURL }) => {
    test.skip(
      Boolean(baseURL?.startsWith("https:")),
      "Sobre HTTPS la cookie sí debe ir marcada.",
    );

    const token = await crearGrupo("e2e-cookie", ["(DES) Gorka"]);
    const contexto = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[type="radio"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    const borrador = (await contexto.cookies()).find((galleta) =>
      galleta.name.startsWith("boda:rsvp"),
    );

    expect(borrador, "el borrador no llegó a guardarse").toBeDefined();
    expect(borrador?.secure).toBe(false);
    // Lo que sí tiene que llevar siempre: nada de esto lo necesita el navegador.
    expect(borrador?.httpOnly).toBe(true);

    await contexto.close();
  });

  test("lo escrito sobrevive al botón de atrás", async ({ browser }) => {
    const token = await crearGrupo("e2e-atras", ["(DES) Cris"]);
    const contexto = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[type="radio"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await pagina.locator('select[name^="menu-"]').selectOption("sin_gluten");
    await pagina.locator('input[name^="alergias-"]').fill("(DES) Celíaca");
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await pagina.getByRole("button", { name: copy.rsvp.atras }).click();

    // Sin esto, volver atrás para corregir una cosa obligaría a reescribirlo todo.
    await expect(pagina.locator('select[name^="menu-"]')).toHaveValue("sin_gluten");
    await expect(pagina.locator('input[name^="alergias-"]')).toHaveValue("(DES) Celíaca");

    await contexto.close();
  });

  /**
   * CASO DE ERROR. Nadie puede quedarse sin contestar: en la base, «pendiente»
   * y «no viene» son cosas distintas, y aquí se sabría a quién le falta pero no
   * qué quiso decir.
   */
  test("no deja avanzar si falta alguien, y dice quién", async ({ browser }) => {
    const token = await crearGrupo("e2e-falta", ["(DES) Dani", "(DES) Eva"]);
    const contexto = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[type="radio"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Se queda en el mismo paso y nombra a quien falta, en vez de un «revisa el
    // formulario» que obliga a buscarlo.
    await expect(pagina.getByText(copy.rsvp.pasoAsistenciaTitulo)).toBeVisible();
    await expect(pagina.getByRole("alert")).toContainText("(DES) Eva");

    await contexto.close();
  });

  test("si no viene nadie, no se pregunta por el menú", async ({ browser }) => {
    const token = await crearGrupo("e2e-nadie", ["(DES) Fran"]);
    const contexto = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="rechazado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Se salta el paso de detalles: preguntarle el menú a quien ha dicho que no
    // puede venir es hacerle perder el tiempo.
    await expect(pagina.getByText(copy.rsvp.pasoMensajeTitulo)).toBeVisible();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasNo);

    await contexto.close();
  });
});

/**
 * BODA-16 · El cortafuegos cuenta por origen, no en un montón común
 *
 * `huella_peticion()` lee `request.headers`, un ajuste que pone PostgREST. Esta
 * aplicación consulta por SQL directo, así que ese ajuste no existía y la
 * función caía en su respaldo: `'desconocido'`, el mismo para todos. Diez
 * intentos fallidos de una sola persona —o de un robot probando enlaces al
 * azar— cerraban la confirmación a los ciento veinte invitados durante quince
 * minutos.
 *
 * La semana antes de la boda eso no se lee como un cortafuegos: se lee como
 * que la web está rota.
 */
test.describe("El cortafuegos del RSVP", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para leer los intentos anotados.");

  test("cada origen tiene su propio cupo", async ({ browser }) => {
    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" },
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/no-existe-este-token-cortafuegos`);
    await expect(pagina.getByText(copy.rsvp.tokenInvalido)).toBeVisible();

    const anotados = await conBase(
      (sql) => sql<{ huella: string }[]>`
        select huella from public.intentos_rsvp
         where huella = '203.0.113.7'
         order by creado_en desc
         limit 1
      `,
    );

    // Si esto vuelve vacío, la huella no llega a la base y todos los invitados
    // vuelven a compartir el mismo cupo.
    expect(anotados).toHaveLength(1);

    await contexto.close();
  });

  test("dos orígenes distintos se anotan por separado", async ({ browser }) => {
    for (const ip of ["198.51.100.1", "198.51.100.2"]) {
      const contexto = await browser.newContext({
        locale: "es-ES",
        extraHTTPHeaders: { "x-forwarded-for": ip },
      });
      const pagina = await contexto.newPage();
      await pagina.goto(`${RUTA_RSVP}/no-existe-tampoco-${ip.replaceAll(".", "-")}`);
      await contexto.close();
    }

    const huellas = await conBase(
      (sql) => sql<{ huella: string }[]>`
        select distinct huella from public.intentos_rsvp
         where huella in ('198.51.100.1', '198.51.100.2')
      `,
    );

    // Dos filas, no una: el cupo de uno no puede gastarle el de nadie más.
    expect(huellas).toHaveLength(2);
  });
});

/**
 * CASO DE ERROR · Un enlace que no vale no puede contar nada de nadie.
 */
test.describe("Un enlace que no vale", () => {
  test("lo dice sin filtrar un solo dato", async ({ page }) => {
    await page.goto(`${RUTA_RSVP}/token-que-no-existe-000000`);

    await expect(page.getByText(copy.rsvp.tokenInvalido)).toBeVisible();

    // Ni nombres, ni cuántas personas había, ni si el token existió alguna vez.
    // El prefijo del seed es la señal: si aparece, se ha escapado algo.
    await expect(page.locator("body")).not.toContainText("(DES)");
    await expect(page.locator('input[type="radio"]')).toHaveCount(0);
  });

  /**
   * BODA-58 · UN TOKEN FALSO Y UNO REVOCADO TIENEN QUE SER INDISTINGUIBLES.
   *
   * Si la respuesta cambiara entre «este token no ha existido nunca» y
   * «existió y se revocó», quien fuera probando cadenas sabría cuándo ha dado
   * con la forma de un token de verdad. Y ése es justo el trabajo previo de
   * adivinar uno.
   *
   * HOY ESTO SE CUMPLE POR CONSTRUCCIÓN, y el test existe para que siga
   * cumpliéndose. La base no guarda el token sino su huella, y revocar es
   * dejar de tener una fila con esa huella: no queda ni rastro de que existiera,
   * así que no hay nada que pudiera contarlo. El día que alguien añada una
   * tabla de tokens retirados para dar un mensaje más amable —«este enlace se
   * sustituyó por otro», que es una idea razonable— este test se pondrá rojo y
   * dirá por qué no se puede.
   *
   * Se comparan los dos HTML enteros y no sólo el rótulo: una diferencia en
   * una etiqueta oculta, en el título del documento o en una meta cuenta lo
   * mismo que una diferencia a la vista.
   *
   * La revocación se hace borrando el grupo y volviéndolo a emitir, que es lo
   * que queda al alcance de un test sin sesión: el trigger `RSV06` sólo deja
   * cambiar la huella a un editor. La rotación por el panel, con sesión, la
   * cubre `panel-invitados.spec.ts`.
   */
  test("un token falso y uno revocado dan exactamente la misma respuesta", async ({
    request,
  }) => {
    const revocado = await crearGrupo(`revocado-${Date.now()}`, ["(DES) Revocada"]);

    // Mientras vale, vale: si esto no pasara, el resto del test compararía dos
    // páginas de error sin haber demostrado nada.
    const valido = await request.get(`${RUTA_RSVP}/${revocado}`);
    expect(await valido.text()).toContain("(DES) Revocada");

    await conBase(
      (sql) => sql`
        delete from public.grupos_invitacion
         where huella_token = public.huella_token(${revocado})
      `,
    );

    // Y uno que no ha existido nunca, con la misma pinta y la misma longitud:
    // comparar contra una cadena más corta mediría el largo, no el contrato.
    const inventado = revocado.replace(/.$/, "9");
    expect(inventado).not.toBe(revocado);
    expect(inventado).toHaveLength(revocado.length);

    const [comoRevocado, comoInventado] = await Promise.all([
      request.get(`${RUTA_RSVP}/${revocado}`),
      request.get(`${RUTA_RSVP}/${inventado}`),
    ]);

    expect(comoRevocado.status()).toBe(comoInventado.status());

    const htmlRevocado = await comoRevocado.text();
    const htmlInventado = await comoInventado.text();

    // El token va en la URL, así que aparece en el HTML de su propia página:
    // se neutraliza en los dos antes de comparar, que es lo único que puede
    // diferir legítimamente.
    const sinToken = (html: string, token: string) => html.replaceAll(token, "TOKEN");

    expect(
      sinToken(htmlInventado, inventado),
      "el HTML delata si el token existió: se podría adivinar uno probando",
    ).toBe(sinToken(htmlRevocado, revocado));

    // Y lo que dicen los dos es que no vale, sin contar de quién era.
    expect(htmlRevocado).toContain(copy.rsvp.tokenInvalido);
    expect(htmlRevocado).not.toContain("(DES) Revocada");
  });

  test("la página del RSVP no se indexa", async ({ page }) => {
    // El token va en la URL. Una línea en un buscador, o una vista previa de
    // WhatsApp con el nombre del grupo, es una fuga.
    const respuesta = await page.goto(`${RUTA_RSVP}/token-que-no-existe-000000`);
    expect(respuesta?.headers()["x-robots-tag"] ?? "").toMatch(/noindex/);
  });
});

/**
 * BODA-56 · EDITAR LA RESPUESTA HASTA LA FECHA LÍMITE
 *
 * La gente cambia de planes. Si no puede cambiarlo sola acaba mandando un
 * WhatsApp que hay que transcribir a mano, y transcribir a mano es donde se
 * pierden los números que ya se le habían dado al catering.
 *
 * Lo que se prueba no es que el botón esté: es que la respuesta **cambia en la
 * base** y que la anterior no desaparece. Un histórico que se pisa a sí mismo
 * no sirve para contestar la única pregunta que importa cuando cambia un
 * número —«¿desde cuándo?»—.
 */
test.describe("Cambiar una respuesta ya dada", () => {
  test("se puede editar mientras haya plazo, y la anterior queda en el historial", async ({
    browser,
  }) => {
    const token = await crearGrupo(`editar-${Date.now()}`, ["(DES) Editable"]);

    const contexto = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const pagina = await contexto.newPage();

    // Primero, que sí.
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);

    // Y ahora, que no: el mismo enlace reabre la respuesta.
    await pagina.getByRole("button", { name: copy.rsvp.editarRespuesta }).click();
    await pagina.locator('input[value="rechazado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasNo);

    await contexto.close();

    // La base es la que manda: la vigente es la nueva y la vieja sigue ahí.
    const filas = await conBase(
      (sql) => sql<{ estado: string; es_vigente: boolean }[]>`
        select c.estado, c.es_vigente
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token})
         order by c.creado_en
      `,
    );

    const vigentes = filas.filter((fila) => fila.es_vigente);
    expect(vigentes, "tiene que haber exactamente una respuesta vigente").toHaveLength(1);
    expect(vigentes[0].estado).toBe("rechazado");

    // Y la anterior no se ha borrado: sin esto no se puede saber desde cuándo
    // cambió un número que ya se había dado al catering.
    expect(
      filas.some((fila) => !fila.es_vigente && fila.estado === "confirmado"),
      "la respuesta anterior tiene que quedar en el historial",
    ).toBe(true);
  });

  /**
   * CASO DE ERROR · Con el plazo cerrado se puede ver, pero no cambiar.
   *
   * Y no basta con esconder el botón: lo que de verdad cierra la puerta es el
   * trigger de la base, que es lo que este test comprueba llamando a la función
   * pública **como `anon`**, saltándose la pantalla entera. Si sólo se probara
   * el botón, cualquiera con la URL podría seguir escribiendo.
   */
  test("con el plazo cerrado no se puede cambiar, y se dice a quién escribir", async ({
    browser,
  }) => {
    const token = await crearGrupo(`plazo-${Date.now()}`, ["(DES) Tarde"]);

    const contexto = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);

    await conPlazoCerrado(async () => {
      await pagina.goto(`${RUTA_RSVP}/${token}`);

      // Se sigue viendo lo que se contestó: cerrar el plazo no es esconder la
      // respuesta, es no dejar cambiarla.
      await expect(pagina.getByText("(DES) Tarde")).toBeVisible();

      // El botón de cambiar no está, y en su lugar hay una explicación.
      await expect(pagina.getByRole("button", { name: copy.rsvp.editarRespuesta })).toHaveCount(
        0,
      );
      await expect(pagina.getByText(copy.rsvp.plazoCerradoContacto)).toBeVisible();

      // Y a quién escribir, que es el criterio del ticket: «escribidnos» sin
      // una dirección no le resuelve nada a nadie.
      const correo = await correoDeContacto();
      await expect(pagina.getByRole("link", { name: correo })).toHaveAttribute(
        "href",
        `mailto:${correo}`,
      );

      // Lo que de verdad cierra la puerta: forzar el envío por debajo de la
      // pantalla, como `anon`, tampoco escribe nada.
      const intento = conBase(
        (sql) =>
          sql.begin(async (tx) => {
            await tx`set local role anon`;
            return tx`
              select public.registrar_confirmacion(
                ${token},
                ${tx.json([{ invitado_id: "00000000-0000-4000-8000-000000000000", estado: "rechazado" }])}
              )
            `;
          }) as Promise<unknown>,
      );

      await expect(intento, "con el plazo cerrado la base tiene que negarse").rejects.toThrow();
    });

    await contexto.close();

    // Y sigue siendo la que era.
    const [vigente] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select c.estado
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token}) and c.es_vigente
      `,
    );
    expect(vigente.estado).toBe("confirmado");
  });
});
