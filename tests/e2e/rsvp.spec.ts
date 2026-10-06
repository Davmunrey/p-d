import { expect, origenDelTest, test } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { LARGOS_DE_CAMPO, LIMITE_TEXTO_CANCION, RUTA_RSVP } from "../../src/config/constants";
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

/**
 * CADA CONTEXTO, CON SU PROPIO ORIGEN.
 *
 * `obtener_invitacion()` pasa por `exigir_cupo_rsvp()`, que cuenta intentos
 * por origen — y TODA la suite sale de `127.0.0.1`. Los tests que abren
 * enlaces inválidos a propósito gastan ese cupo, y para cuando arranca el
 * proyecto móvil —que corre después del de escritorio— la IP está cerrada: la
 * lectura lanza y la página muestra «Estamos preparando la web».
 *
 * Pasó en CI y sólo en `movil`, que es justo el que no puedo ejecutar aquí.
 * No se relaja el límite —es una protección de verdad—: se deja de compartir
 * el cubo. Los tests del cortafuegos siguen usando sus IP fijas, que es su
 * razón de ser.
 */
let contador = 0;
const origenPropio = () => ({
  "x-forwarded-for": `198.51.100.${((contador += 1) % 200) + 20}`,
});

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
  await conBase(async (sql) => {
    // Las canciones ANTES que el grupo: la clave ajena es `on delete set null`
    // y borrar el grupo primero las dejaría huérfanas en la playlist de verdad.
    await sql`
      delete from public.canciones_sugeridas
       where grupo_id in (
         select id from public.grupos_invitacion where nombre like '(DES) Grupo e2e-%'
       )
    `;
    await sql`delete from public.grupos_invitacion where nombre like '(DES) Grupo e2e-%'`;
  });
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
      extraHTTPHeaders: origenPropio(),
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
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
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
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
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
   *
   * Y se señala a TODOS los que faltan, no al primero: una familia que pulsaba
   * «Siguiente» sin marcar a nadie se encontraba el aviso una vez por persona.
   */
  test("sin contestar por alguien no se avanza, y se señala a todos los que faltan", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-faltan", ["(DES) Ana", "(DES) Bego", "(DES) Cris"]);
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    // Sólo Bego. Van por orden alfabético: Ana, Bego, Cris.
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').nth(1).check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await expect(pagina).toHaveURL(/paso=asistencia&falta=/);
    const aviso = (nombre: string) => copy.rsvp.errorSinRespuesta.replace("{nombre}", nombre);
    await expect(pagina.getByText(aviso("(DES) Ana"))).toBeVisible();
    await expect(pagina.getByText(aviso("(DES) Cris"))).toBeVisible();
    // A quien sí contestó no se le acusa de nada, y su respuesta sigue marcada.
    await expect(pagina.getByText(aviso("(DES) Bego"))).toHaveCount(0);
    await expect(pagina.locator('input[value="confirmado"]').nth(1)).toBeChecked();
    // El ancla lleva al primero que falta.
    expect(new URL(pagina.url()).hash).toMatch(/^#persona-/);

    await contexto.close();
  });

  /**
   * CASO DE ERROR · Volver a incluir a alguien no le borra la alergia que ya
   * tenía apuntada.
   *
   * Ana sí, Bego no → el paso de detalles sólo pinta a Ana. Antes, la acción
   * recorría a TODO el grupo y escribía `alergias = ""` también para Bego; al
   * cambiarla a «sí», su «celíaca» de la base llegaba tapada por ese "" y se
   * enviaba vacía a la cocina sin que nadie viera un error.
   */
  test("volver a incluir a alguien conserva la alergia que ya tenía en la base", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-alergia", ["(DES) Ana", "(DES) Bego"]);
    await conBase(
      (sql) => sql`
        update public.invitados as i
           set alergias = '(DES) Celíaca'
          from public.grupos_invitacion as g
         where g.id = i.grupo_id
           and g.huella_token = public.huella_token(${token})
           and i.nombre = '(DES) Bego'
      `,
    );

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    // Ana sí, Bego no. Las personas van por orden alfabético: Ana, Bego.
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').nth(0).check();
    await pagina.locator('input[value="rechazado"]').nth(1).check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Sólo Ana en detalles.
    await expect(pagina.locator('input[name^="alergias-"]')).toHaveCount(1);
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Atrás dos veces y cambian de idea con Bego.
    await pagina.getByRole("button", { name: copy.rsvp.atras }).click();
    await pagina.getByRole("button", { name: copy.rsvp.atras }).click();
    await pagina.locator('input[value="confirmado"]').nth(1).check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Ahora los dos, y la alergia de Bego viene de la base, no vacía.
    await expect(pagina.locator('input[name^="alergias-"]')).toHaveCount(2);
    await expect(pagina.locator('input[name^="alergias-"]').nth(1)).toHaveValue(
      "(DES) Celíaca",
    );

    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await contexto.close();

    const [bego] = await conBase(
      (sql) => sql<{ alergias: string | null }[]>`
        select i.alergias
          from public.invitados as i
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token})
           and i.nombre = '(DES) Bego'
      `,
    );
    expect(bego.alergias).toBe("(DES) Celíaca");
  });

  /**
   * El menú infantil sólo se ofrece a quien está marcado como niño: para un
   * adulto la base lo descarta en silencio y deja «estándar», así que
   * ofrecerlo era prometer un menú que no se iba a servir.
   */
  test("el menú infantil sólo se ofrece a los niños", async ({ browser }) => {
    const token = await crearGrupo("e2e-infantil", ["(DES) Lucía", "(DES) Padre"]);
    await conBase(
      (sql) => sql`
        update public.invitados as i
           set es_nino = true
          from public.grupos_invitacion as g
         where g.id = i.grupo_id
           and g.huella_token = public.huella_token(${token})
           and i.nombre = '(DES) Lucía'
      `,
    );

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').nth(0).check();
    await pagina.locator('input[value="confirmado"]').nth(1).check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    const menus = pagina.locator('select[name^="menu-"]');
    await expect(menus).toHaveCount(2);
    // Lucía primero (orden alfabético): con infantil. Padre: sin él.
    await expect(menus.nth(0).locator('option[value="infantil"]')).toHaveCount(1);
    await expect(menus.nth(1).locator('option[value="infantil"]')).toHaveCount(0);

    await contexto.close();
  });

  /**
   * CASO DE ERROR · Con el cupo de intentos agotado, un enlace BUENO no dice
   * «estamos preparando la web». RSV02 no es una avería: es el cortafuegos, y
   * antes se contaba con el texto de la avería, que es el de «vuelve en un
   * rato» — el invitado creía que la web no existía todavía.
   */
  test("con el cupo agotado, un enlace bueno pide esperar, no dice que la web está en obras", async ({
    request,
  }) => {
    const token = await crearGrupo("e2e-cupo", ["(DES) Paciente"]);
    const [{ maximo }] = await conBase(
      (sql) => sql<{ maximo: number }[]>`
        select maximo_intentos_rsvp::int as maximo from public.parametros_seguridad
      `,
    );

    // Un origen propio, y se agota a base de enlaces inventados.
    const headers = origenPropio();
    for (let i = 0; i < maximo; i += 1) {
      await request.get(`${RUTA_RSVP}/token-que-no-existe-${i}`, { headers });
    }

    const respuesta = await request.get(`${RUTA_RSVP}/${token}`, { headers });
    const html = await respuesta.text();
    expect(html).toContain(copy.rsvp.demasiadosIntentos);
    expect(html).not.toContain(copy.portada.enPreparacion);
    expect(html).not.toContain(copy.rsvp.tokenInvalido);
  });

  /**
   * CASO DE ERROR · Un mensaje largo DE VERDAD sobrevive al «atrás».
   *
   * El test de «no cabe» usa dos mil «a» seguidas, que codificadas ocupan dos
   * mil bytes. Un mensaje real lleva espacios y tildes, que Next escribe en la
   * cookie como `%20` y `%C3%AD`: con cuatro personas pasaba de los 4096 bytes
   * y el navegador tiraba la cookie sin decir nada. El texto se perdía.
   */
  test("un mensaje largo de verdad, con tildes y espacios, sobrevive al atrás", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-mensaje-largo", [
      "(DES) Uno",
      "(DES) Dos",
      "(DES) Tres",
      "(DES) Cuatro",
    ]);
    const frase =
      "Qué ilusión nos hace ir a vuestra boda, de verdad. Iremos los cuatro y nos quedaremos hasta el final; ";
    // Sin espacio al final: el borrador guarda el texto recortado por los
    // bordes, y eso es lo esperable; lo que no puede pasar es perder el resto.
    const mensaje = frase
      .repeat(40)
      .slice(0, LARGOS_DE_CAMPO["confirmaciones.mensaje"])
      .trimEnd();

    // Sin scroll suave: con cuatro personas el botón queda muy abajo, y el
    // `scroll-behavior: smooth` de la web hace que Playwright lo vea moverse
    // en cada reintento de hacer scroll y nunca lo dé por quieto. Es lo que
    // ve quien pide menos movimiento, y la playlist ya prueba así.
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      reducedMotion: "reduce",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    for (let i = 0; i < 4; i += 1) {
      await pagina.locator('input[value="confirmado"]').nth(i).check();
    }
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    for (let i = 0; i < 4; i += 1) {
      await pagina
        .locator('input[name^="alergias-"]')
        .nth(i)
        .fill("(DES) Celíaca, y frutos secos");
    }
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await pagina.locator('textarea[name="mensaje"]').fill(mensaje);
    await pagina.getByRole("button", { name: copy.rsvp.atras }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await expect(pagina.locator('textarea[name="mensaje"]')).toHaveValue(mensaje);

    await contexto.close();
  });

  test("no deja avanzar si falta alguien, y dice quién", async ({ browser }) => {
    const token = await crearGrupo("e2e-falta", ["(DES) Dani", "(DES) Eva"]);
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
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

  /**
   * CASO DE ERROR · UN MENSAJE MÁS LARGO DE LO QUE CABE LO DICE LA PANTALLA.
   *
   * Los tres campos que escribe un invitado —mensaje, canción y alergias—
   * tienen su tope en un CHECK de la base y no lo tenían en la pantalla.
   * Pasarse no daba un aviso: `registrar_confirmacion` saltaba con 23514, un
   * código que `motivoDe` no reconoce, y la confirmación entera volvía como
   * «avería» — el mensaje de «esto es culpa nuestra, escribidnos», con su
   * alerta de Sentry incluida. Quien escribía una carta larga no podía
   * confirmar por mucho que reintentara, y nada le decía por qué.
   *
   * SE PRUEBA SIN JAVASCRIPT Y ESCRIBIENDO EN EL DOM, a propósito: el
   * `maxLength` del campo corta antes en un navegador normal, así que un test
   * que teclee el texto nunca llegaría al servidor y estaría probando el
   * navegador en lugar del arreglo. Lo que hay que sostener es que el extremo
   * público aguanta lo que le manden, que es lo que hay que suponer de un
   * extremo público.
   */
  test("un mensaje que no cabe se avisa, y no se escribe nada", async ({ browser }) => {
    const token = await crearGrupo("e2e-largo", ["(DES) Lucía"]);
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[type="radio"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    // Se salta el `maxLength` escribiendo el valor directamente, que es lo que
    // haría cualquiera que no mande el formulario desde el navegador.
    await pagina.locator('textarea[name="mensaje"]').evaluate((campo) => {
      (campo as HTMLTextAreaElement).removeAttribute("maxlength");
      (campo as HTMLTextAreaElement).value = "a".repeat(2001);
    });
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();

    // Lo dice, y sigue en el mismo paso con el texto delante.
    await expect(pagina.getByRole("alert")).toContainText(copy.rsvp.demasiadoLargo);
    await expect(pagina.getByRole("button", { name: copy.rsvp.enviar })).toBeVisible();

    // Y NO HA ESCRITO NADA: la confirmación sigue pendiente, no «averiada».
    const estados = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select c.estado
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token}) and c.es_vigente
      `,
    );
    expect(estados.map((fila) => fila.estado)).toEqual(["pendiente"]);

    await contexto.close();
  });

  /**
   * CASO DE ERROR · Una canción que la playlist no admite no pasa por buena.
   *
   * El campo dejaba 200 caracteres (el tope de la columna) y la playlist sólo
   * admite 160: entre medias, la pantalla decía «¡Qué alegría!» y la canción no
   * llegaba nunca a la lista. Ahora el tope es el de la playlist, en el campo y
   * en el servidor.
   */
  test("una canción más larga de lo que admite la playlist se avisa, y no se escribe nada", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-cancion-larga", ["(DES) Íñigo"]);
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      // Sin desplazamiento suave: con él, el botón de enviar «se mueve» mientras
      // la página baja y Playwright no llega a pulsarlo.
      reducedMotion: "reduce",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[type="radio"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    const cancion = pagina.locator('input[name="cancion"]');
    await expect(cancion).toHaveAttribute("maxlength", String(LIMITE_TEXTO_CANCION));
    await cancion.evaluate((campo, largo) => {
      (campo as HTMLInputElement).removeAttribute("maxlength");
      (campo as HTMLInputElement).value = "a".repeat(largo);
    }, LIMITE_TEXTO_CANCION + 1);
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();

    await expect(pagina.getByRole("alert")).toContainText(copy.rsvp.demasiadoLargo);
    const estados = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select c.estado
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token}) and c.es_vigente
      `,
    );
    expect(estados.map((fila) => fila.estado)).toEqual(["pendiente"]);

    await contexto.close();
  });

  /**
   * CAMINO FELIZ Y CASO DE ERROR · Intro va hacia adelante.
   *
   * El primer botón de envío del formulario era «Atrás», y el envío implícito
   * —Intro en un campo, «Ir» en el teclado del móvil— pulsa el primero. Quien
   * escribía su alergia y tocaba «Ir» volvía al paso anterior. Se comprueba
   * sin JavaScript (el formulario nativo) y con él (React manda el botón que
   * se pulsó).
   */
  for (const conJs of [false, true]) {
    test(`Intro en un campo de texto avanza, no retrocede (${conJs ? "con" : "sin"} JavaScript)`, async ({
      browser,
    }) => {
      const token = await crearGrupo(`e2e-intro-${conJs ? "js" : "sinjs"}`, ["(DES) Elsa"]);
      const contexto = await browser.newContext({
        javaScriptEnabled: conJs,
        locale: "es-ES",
        // Sin desplazamiento suave: con él, el botón de enviar «se mueve» mientras
        // la página baja y Playwright no llega a pulsarlo.
        reducedMotion: "reduce",
        extraHTTPHeaders: origenPropio(),
      });
      const pagina = await contexto.newPage();

      await pagina.goto(`${RUTA_RSVP}/${token}`);
      await pagina.locator('input[type="radio"]').first().check();
      await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
      await expect(pagina).toHaveURL(/paso=detalles/);

      await pagina.getByLabel(copy.rsvp.alergias).fill("(DES) Ninguna");
      await pagina.getByLabel(copy.rsvp.alergias).press("Enter");
      await expect(pagina).toHaveURL(/paso=mensaje/);

      await pagina.getByLabel(copy.rsvp.cancion).fill("(DES) Una de Elsa");
      await pagina.getByLabel(copy.rsvp.cancion).press("Enter");
      await expect(pagina).toHaveURL(/enviado=1/);
      await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);

      await contexto.close();
    });
  }

  /**
   * CASO DE ERROR · Lo que ya habían contestado no se pisa al volver a pasar.
   *
   * La familia contesta (Ana viene, con autobús, y dejan una canción y un
   * mensaje); después los novios añaden a alguien al grupo y la familia vuelve
   * a abrir el enlace, en otro móvil y sin borrador. El formulario salía en
   * blanco en el autobús, la canción y el mensaje, y al enviar los escribía en
   * blanco: Ana perdía la plaza de autobús y el mensaje desaparecía de la
   * bandeja de los novios. Ahora sale lo que había, y se escribe lo que había.
   */
  test("al añadir a alguien a una familia que ya contestó, no se pierden su autobús ni su mensaje", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-anadida", ["(DES) Ana", "(DES) Beto"]);
    const persona = (pagina: import("./utiles/origen-propio").Page, nombre: string) =>
      pagina.getByRole("group", { name: new RegExp(nombre) });

    // 1 · La familia contesta por primera vez.
    const primera = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      // Sin desplazamiento suave: con él, el botón de enviar «se mueve» mientras
      // la página baja y Playwright no llega a pulsarlo.
      reducedMotion: "reduce",
      extraHTTPHeaders: origenPropio(),
    });
    const antes = await primera.newPage();
    await antes.goto(`${RUTA_RSVP}/${token}`);
    await persona(antes, "Ana").getByLabel(copy.rsvp.vieneSi).check();
    await persona(antes, "Beto").getByLabel(copy.rsvp.vieneNo).check();
    await antes.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await persona(antes, "Ana").getByLabel(copy.rsvp.autobusPersona).check();
    await antes.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await antes.getByLabel(copy.rsvp.cancion).fill("(DES) La canción de Ana");
    await antes.getByLabel(copy.rsvp.mensaje).fill("(DES) Allí estaremos");
    await antes.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(antes.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await primera.close();

    // 2 · Los novios añaden a alguien.
    await conBase(
      (sql) => sql`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        select id, '(DES) Carla', '(DES)', false
          from public.grupos_invitacion
         where huella_token = public.huella_token(${token})
      `,
    );

    // 3 · La familia vuelve, sin borrador: lo de antes sale como estaba.
    const segunda = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      // Sin desplazamiento suave: con él, el botón de enviar «se mueve» mientras
      // la página baja y Playwright no llega a pulsarlo.
      reducedMotion: "reduce",
      extraHTTPHeaders: origenPropio(),
    });
    const despues = await segunda.newPage();
    await despues.goto(`${RUTA_RSVP}/${token}`);
    await expect(persona(despues, "Ana").getByLabel(copy.rsvp.vieneSi)).toBeChecked();
    await expect(persona(despues, "Beto").getByLabel(copy.rsvp.vieneNo)).toBeChecked();
    await persona(despues, "Carla").getByLabel(copy.rsvp.vieneSi).check();
    await despues.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await expect(persona(despues, "Ana").getByLabel(copy.rsvp.autobusPersona)).toBeChecked();
    await despues.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await expect(despues.getByLabel(copy.rsvp.cancion)).toHaveValue("(DES) La canción de Ana");
    await expect(despues.getByLabel(copy.rsvp.mensaje)).toHaveValue("(DES) Allí estaremos");
    await despues.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(despues.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    await segunda.close();

    // 4 · Y en la base: Ana conserva el autobús y el mensaje sigue vigente.
    const filas = await conBase(
      (sql) => sql<
        { nombre: string; estado: string; autobus: boolean | null; mensaje: string | null }[]
      >`
        select i.nombre, c.estado, c.necesita_autobus as autobus, c.mensaje
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token}) and c.es_vigente
         order by i.nombre
      `,
    );
    const ana = filas.find((fila) => fila.nombre === "(DES) Ana");
    expect(ana?.estado).toBe("confirmado");
    expect(ana?.autobus).toBe(true);
    expect(filas.find((fila) => fila.nombre === "(DES) Carla")?.estado).toBe("confirmado");
    expect(filas.map((fila) => fila.mensaje).filter(Boolean)).toEqual(["(DES) Allí estaremos"]);
  });

  /**
   * CASO DE ERROR · Si la base deja de contestar a mitad del formulario, el
   * invitado lo lee en castellano y lo que acaba de marcar no se pierde.
   *
   * La acción leía la invitación sin protegerse: ante el cortafuegos (alguien
   * de la misma wifi probando enlaces malos) o una avería, la excepción subía
   * hasta la página de error de serie de Next —«Internal Server Error», en
   * inglés— y lo marcado en ese paso se perdía.
   */
  test("si el cortafuegos se cierra a mitad del formulario, se dice en castellano y lo marcado se guarda", async ({
    browser,
    request,
  }) => {
    const token = await crearGrupo("e2e-corte", ["(DES) Gala"]);
    const [{ maximo }] = await conBase(
      (sql) => sql<{ maximo: number }[]>`
        select maximo_intentos_rsvp::int as maximo from public.parametros_seguridad
      `,
    );
    // Este test AGOTA el cupo de su origen, así que el origen tiene que ser
    // sólo suyo: el de `origenDelTest()` cambia con el proyecto y el
    // reintento. Con el contador del fichero, el proyecto `movil` repetía la
    // misma IP que acababa de agotar `escritorio`, y la invitación abría ya
    // con «demasiados intentos».
    const headers = origenDelTest();
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      // Sin desplazamiento suave: con él, el botón de enviar «se mueve» mientras
      // la página baja y Playwright no llega a pulsarlo.
      reducedMotion: "reduce",
      extraHTTPHeaders: headers,
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.getByLabel(copy.rsvp.vieneSi).check();

    // Mientras tanto, desde la misma conexión, se agota el cupo.
    for (let i = 0; i < maximo; i += 1) {
      await request.get(`${RUTA_RSVP}/token-que-no-existe-corte-${i}`, { headers });
    }

    const [envio] = await Promise.all([
      pagina.waitForResponse((respuesta) => respuesta.request().method() === "POST"),
      pagina.getByRole("button", { name: copy.rsvp.siguiente }).click(),
    ]);
    expect(envio.status(), "la acción no puede acabar en un 500").toBeLessThan(500);
    await expect(pagina.locator("body")).toContainText(copy.rsvp.demasiadosIntentos);
    await expect(pagina.locator("body")).not.toContainText("Internal Server Error");

    const cookie = (await contexto.cookies()).find((galleta) => galleta.name === "boda:rsvp");
    expect(cookie, "lo marcado tiene que quedar en el borrador").toBeTruthy();
    const borrador = JSON.parse(Buffer.from(cookie!.value, "base64url").toString("utf8")) as {
      asistencia: Record<string, string>;
    };
    expect(Object.values(borrador.asistencia)).toEqual(["confirmado"]);

    await contexto.close();
  });

  /**
   * CASO DE ERROR · SIN BORRADOR, EL ENVÍO NO PUEDE DAR A NADIE DE BAJA.
   *
   * `leerBorrador()` devuelve uno VACÍO —a propósito— cuando la cookie falta,
   * está rota o es de otro enlace. Y pasa de verdad: caduca, Safari la
   * descarta, alguien comparte el enlace con `?paso=mensaje` puesto, o se abre
   * en otro móvil. Hasta este arreglo, ese envío escribía `rechazado` para toda
   * la familia, en silencio, porque «sin contestar» y «no viene» acababan
   * siendo lo mismo. La pareja se encontraba a los dos dados de baja sin que
   * nadie hubiera dicho que no, y `confirmaciones` es un histórico: eso no se
   * deshace.
   *
   * Se reproduce el caso exacto: se entra directamente al último paso sin
   * cookie de borrador y se pulsa enviar.
   */
  test("sin borrador, enviar el último paso no da de baja a nadie", async ({ browser }) => {
    const token = await crearGrupo("e2e-sin-borrador", ["(DES) Hugo", "(DES) Iria"]);
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    // Directo al paso del mensaje, que es donde vive el botón de enviar, y sin
    // haber pasado por asistencia: el contexto es nuevo, así que no hay cookie.
    await pagina.goto(`${RUTA_RSVP}/${token}?paso=mensaje`);
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();

    // Vuelve a preguntar, en vez de decidir por ellos.
    await expect(pagina.getByText(copy.rsvp.pasoAsistenciaTitulo)).toBeVisible();

    /*
      Y LO QUE DE VERDAD IMPORTA: nadie ha quedado dado de baja. Se mira el
      estado VIGENTE y no el número de filas, porque toda persona nace con una
      confirmación «pendiente» que le pone `crear_confirmacion_inicial()`:
      contar filas daría dos con el fallo y dos sin él, es decir, no mediría
      nada. Lo que distingue el fallo del arreglo es el estado.
    */
    const estados = await conBase(
      (sql) => sql<{ nombre: string; estado: string }[]>`
        select i.nombre, c.estado::text as estado
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.huella_token = public.huella_token(${token}) and c.es_vigente
         order by i.nombre
      `,
    );

    expect(
      estados.map((fila) => fila.estado),
      "un borrador perdido no puede dar de baja a nadie",
    ).toEqual(["pendiente", "pendiente"]);

    await contexto.close();
  });

  test("si no viene nadie, no se pregunta por el menú", async ({ browser }) => {
    const token = await crearGrupo("e2e-nadie", ["(DES) Fran"]);
    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
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
    const revocado = await crearGrupo(`e2e-revocado-${Date.now()}`, ["(DES) Revocada"]);

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
    // se neutraliza en los dos antes de comparar. Y el nonce de la
    // Content-Security-Policy, que es distinto en cada petición a propósito:
    // son las dos únicas cosas que pueden diferir legítimamente.
    const sinToken = (html: string, token: string) => {
      const nonce = html.match(/nonce="([^"]+)"/)?.[1];
      const sinNonce = nonce ? html.replaceAll(nonce, "NONCE") : html;
      return sinNonce.replaceAll(token, "TOKEN");
    };

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
    const token = await crearGrupo(`e2e-editar-${Date.now()}`, ["(DES) Editable"]);

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    // Primero, que sí, y con canción.
    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[value="confirmado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await pagina.locator('input[name="cancion"]').fill("(DES) La misma de siempre");
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);

    // Y ahora, que no: el mismo enlace reabre la respuesta. La canción llega
    // sembrada de la respuesta anterior y se manda otra vez sin tocarla.
    await pagina.getByRole("button", { name: copy.rsvp.editarRespuesta }).click();
    await pagina.locator('input[value="rechazado"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
    await expect(pagina.locator('input[name="cancion"]')).toHaveValue(
      "(DES) La misma de siempre",
    );
    await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
    await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasNo);

    await contexto.close();

    // Reeditar no apunta la canción dos veces: la playlist la tiene UNA vez.
    // Antes, cada «Cambiar la respuesta» la reinsertaba y gastaba una plaza.
    const enLaPlaylist = await conBase(
      (sql) => sql<{ cuantas: number }[]>`
        select count(*)::int as cuantas
          from public.canciones_sugeridas as c
          join public.grupos_invitacion as g on g.id = c.grupo_id
         where g.huella_token = public.huella_token(${token})
      `,
    );
    expect(enLaPlaylist[0].cuantas).toBe(1);

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
   * CORREGIR LA CANCIÓN LA SUSTITUYE; BORRARLA LA RETIRA.
   *
   * Quien corrige una errata al cambiar la respuesta veía las dos versiones en
   * la portada, gastaba una de sus diez plazas y no tenía forma de quitar la
   * mala. La playlist tiene que acabar con la canción que el grupo pide ahora,
   * y con ninguna si ya no pide ninguna.
   */
  test("corregir la canción al cambiar la respuesta deja sólo la nueva en la playlist", async ({
    browser,
  }) => {
    const token = await crearGrupo(`e2e-cancion-${Date.now()}`, ["(DES) Melómana"]);
    const enLaPlaylist = () =>
      conBase(async (sql) =>
        (
          await sql<{ texto: string }[]>`
            select c.texto
              from public.canciones_sugeridas as c
              join public.grupos_invitacion as g on g.id = c.grupo_id
             where g.huella_token = public.huella_token(${token})
             order by c.texto
          `
        ).map((fila) => fila.texto),
      );

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    const enviarConCancion = async (cancion: string) => {
      await pagina.locator('input[value="confirmado"]').first().check();
      await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
      await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();
      await pagina.locator('input[name="cancion"]').fill(cancion);
      await pagina.getByRole("button", { name: copy.rsvp.enviar }).click();
      await expect(pagina.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);
    };

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await enviarConCancion("(DES) Iglesas, Bailando");
    expect(await enLaPlaylist()).toEqual(["(DES) Iglesas, Bailando"]);

    // La errata se corrige: la vieja sale y entra la buena.
    await pagina.getByRole("button", { name: copy.rsvp.editarRespuesta }).click();
    await enviarConCancion("(DES) Iglesias, Bailando");
    expect(await enLaPlaylist()).toEqual(["(DES) Iglesias, Bailando"]);

    // Y si ya no quiere pedir ninguna, no queda ninguna.
    await pagina.getByRole("button", { name: copy.rsvp.editarRespuesta }).click();
    await enviarConCancion("");
    expect(await enLaPlaylist()).toEqual([]);

    await contexto.close();
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
    const token = await crearGrupo(`e2e-plazo-${Date.now()}`, ["(DES) Tarde"]);

    const contexto = await browser.newContext({
      javaScriptEnabled: false,
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
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

      /*
        Lo que de verdad cierra la puerta: forzar el envío por debajo de la
        pantalla, como `anon`, tampoco escribe nada.

        CON UN INVITADO REAL Y ESPERANDO RSV03. Con un id inventado la función
        rechazaba con RSV04 («no es de este grupo») ANTES de insertar nada, y
        el trigger del plazo —que corre por fila insertada— nunca se ejecutaba:
        la aserción pasaba igual con el plazo abierto, así que no probaba el
        plazo. Se coge la persona del grupo y se exige el código del plazo.
      */
      const [persona] = await conBase(
        (sql) => sql<{ id: string }[]>`
          select i.id
            from public.invitados as i
            join public.grupos_invitacion as g on g.id = i.grupo_id
           where g.huella_token = public.huella_token(${token})
        `,
      );
      const intento = conBase(
        (sql) =>
          sql.begin(async (tx) => {
            await tx`set local role anon`;
            return tx`
              select public.registrar_confirmacion(
                ${token},
                ${tx.json([{ invitado_id: persona.id, estado: "rechazado" }])}
              )
            `;
          }) as Promise<unknown>,
      );

      await expect(intento, "con el plazo cerrado la base tiene que negarse").rejects.toThrow(
        /RSV03/,
      );
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

/*
  AUDITORÍA DE DISEÑO · LO QUE SE VE Y SE TOCA EN EL FORMULARIO.

  · Los radios y la casilla se pintaban con los controles del tema claro sobre
    el marino: lo NO marcado era un disco blanco y lo marcado un gris apagado.
  · Si faltaba contestar por alguien, el aviso quedaba por debajo de la primera
    pantalla del móvil y sin atar a sus radios.
  · Los pasos 2 y 3 repetían el saludo y la entradilla antes de su pregunta.
  · «Enviar confirmación» se apagaba sin decir que estaba enviando.
*/
test.describe("El formulario se lee y responde", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para fabricar la invitación.");

  test("lo marcado es lo que más resalta, y el bloque marino se declara oscuro", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-casillas", ["(DES) Marta", "(DES) Nico"]);
    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    const radios = pagina.locator('input[type="radio"]');
    await radios.nth(0).check();

    const estilos = () =>
      radios.evaluateAll((todos) =>
        todos.slice(0, 2).map((radio) => {
          const estilo = getComputedStyle(radio);
          return { aspecto: estilo.appearance, fondo: estilo.backgroundColor };
        }),
      );
    // El control es el de la marca, no el del sistema.
    expect((await estilos())[0]!.aspecto).toBe("none");
    /*
      Marcado: relleno. Sin marcar: hueco, sin disco blanco.

      SE ESPERA AL COLOR FINAL: el radio lleva `transicion-color`, y leerlo
      justo después de marcarlo da el del primer fotograma —transparente—. En
      local daba tiempo; en el CI, más rápido, no.
    */
    await expect
      .poll(async () => (await estilos())[0]!.fondo, { timeout: 5_000 })
      .not.toBe("rgba(0, 0, 0, 0)");
    expect((await estilos())[1]!.fondo).toBe("rgba(0, 0, 0, 0)");

    // Y el bloque le dice al navegador que es oscuro (desplegables, barras…),
    // sin que el documento deje de ser claro.
    expect(
      await pagina
        .locator('main[data-seccion="inversa"]')
        .evaluate((main) => getComputedStyle(main).colorScheme),
    ).toBe("dark");
    expect(
      await pagina.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    ).toBe("light");

    await contexto.close();
  });

  test("con colores forzados vuelve el control del sistema, que sí se ve marcado", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-forzados", ["(DES) Olga"]);
    const contexto = await browser.newContext({
      locale: "es-ES",
      forcedColors: "active",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    expect(
      await pagina
        .locator('input[type="radio"]')
        .first()
        .evaluate((radio) => getComputedStyle(radio).appearance),
    ).toBe("auto");

    await contexto.close();
  });

  test("si falta alguien, el aviso queda a la vista y atado a sus respuestas", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-falta-ancla", [
      "(DES) Pablo",
      "(DES) Quique",
      "(DES) Rosa",
    ]);
    const contexto = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    const radios = pagina.locator('input[type="radio"]');
    await radios.nth(0).check();
    await radios.nth(2).check();
    // La tercera persona, sin contestar.
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await expect(pagina).toHaveURL(/falta=.*#persona-/);
    const aviso = pagina.getByRole("main").getByRole("alert");
    await expect(aviso).toContainText("(DES) Rosa");
    await expect(aviso).toBeInViewport();

    const idDelAviso = await aviso.getAttribute("id");
    expect(idDelAviso).toBeTruthy();
    await expect(radios.nth(4)).toHaveAttribute("aria-describedby", idDelAviso!);
    // Y sólo los de quien falta: los demás no apuntan a ningún aviso.
    await expect(radios.nth(0)).not.toHaveAttribute("aria-describedby", /.+/);

    await contexto.close();
  });

  test("en los pasos 2 y 3 manda la pregunta del paso, no el saludo repetido", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-pasos", ["(DES) Sara"]);
    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();
    const plazo = /Podéis cambiar la respuesta/;

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await expect(pagina.getByRole("heading", { level: 1 })).toContainText(
      "(DES) Grupo e2e-pasos",
    );
    await expect(pagina.getByRole("heading", { level: 2 })).toHaveText(
      copy.rsvp.pasoAsistenciaTitulo,
    );

    await pagina.locator('input[type="radio"]').first().check();
    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    await expect(pagina.getByRole("heading", { level: 2 })).toHaveText(
      copy.rsvp.pasoDetallesTitulo,
    );
    // El saludo sigue siendo el h1 —el lector de pantalla sabe dónde está—,
    // pero ya no se repite la entradilla.
    await expect(pagina.getByRole("heading", { level: 1 })).toContainText(
      "(DES) Grupo e2e-pasos",
    );
    await expect(pagina.getByText(plazo)).toHaveCount(0);
    await expect(
      pagina.getByText(copy.rsvp.etiquetaPaso.replace("{actual}", "2").replace("{total}", "3")),
    ).toBeVisible();

    // La pregunta del paso es más grande que el nombre de cada persona.
    const tamano = (selector: string) =>
      pagina
        .locator(selector)
        .first()
        .evaluate((nodo) => parseFloat(getComputedStyle(nodo).fontSize));
    expect(await tamano("h2")).toBeGreaterThan(await tamano("legend"));

    await contexto.close();
  });

  test("mientras se guarda, el botón lo dice y no se puede volver a pulsar", async ({
    browser,
  }) => {
    const token = await crearGrupo("e2e-guardando", ["(DES) Teo"]);
    const contexto = await browser.newContext({
      locale: "es-ES",
      extraHTTPHeaders: origenPropio(),
    });
    const pagina = await contexto.newPage();

    await pagina.goto(`${RUTA_RSVP}/${token}`);
    await pagina.locator('input[type="radio"]').first().check();

    // Se retiene la acción un momento para poder ver el botón mientras espera.
    let soltar: () => void = () => {};
    const retenida = new Promise<void>((resolver) => (soltar = resolver));
    await pagina.route(`**${RUTA_RSVP}/${token}*`, async (ruta) => {
      if (ruta.request().method() === "POST") await retenida;
      await ruta.continue();
    });

    await pagina.getByRole("button", { name: copy.rsvp.siguiente }).click();

    const ocupado = pagina.getByRole("button", { name: copy.rsvp.guardando });
    await expect(ocupado).toBeVisible();
    await expect(ocupado).toHaveAttribute("aria-busy", "true");
    await expect(ocupado).toBeDisabled();

    soltar();
    await expect(pagina.getByRole("heading", { level: 2 })).toHaveText(
      copy.rsvp.pasoDetallesTitulo,
    );
    // Al llegar, el botón vuelve a ser el de siempre.
    await expect(pagina.getByRole("button", { name: copy.rsvp.siguiente })).toBeEnabled();

    await contexto.close();
  });
});

test.describe("Las pantallas de error del RSVP dicen qué ha pasado", () => {
  test("un enlace que no vale se titula por lo que es y pide escribir una sola vez", async ({
    page,
  }) => {
    await page.goto(`${RUTA_RSVP}/token-que-no-existe-titulo-000000`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.rsvp.tituloEnlaceNoValido,
    );
    await expect(page.getByText(copy.rsvp.tokenInvalido)).toBeVisible();
    // «Escribidnos» una vez, junto al correo; no en el párrafo y otra vez debajo.
    await expect(page.getByRole("main").getByText(/escribidnos/i)).toHaveCount(1);
  });
});
