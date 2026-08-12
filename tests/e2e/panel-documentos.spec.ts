import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_DOCUMENTOS, RUTA_PANEL } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-105 · Los documentos de la boda civil
 *
 * LO QUE SE PRUEBA ES EL AVISO QUE JUSTIFICA EL MÓDULO. Una lista de papeles
 * con casillas de hecho/sin hacer la sabe hacer cualquiera; lo que aquí hay que
 * demostrar es que un documento **conseguido** que caduca antes de la boda sale
 * marcado igualmente. Es el caso en el que la pantalla, leída de arriba abajo,
 * engañaría: «conseguido» parece el final del camino y no lo es. Por eso el
 * caso de error no es un formulario mal rellenado, es ése.
 *
 * Y SE PRUEBA CONTRA LA BASE, no contra el HTML. La comparación con la fecha de
 * la boda la hace `v_documentos_boda`, así que el test la interroga
 * directamente: si un día alguien mueve esa cuenta a TypeScript, la pantalla
 * podría seguir enseñando el aviso y la base habría dejado de calcularlo.
 *
 * LA SIEMBRA VA RELATIVA A `configuracion_boda`. Escribir «2027-06-12» a mano
 * ata el test a la fecha que tuviera el seed el día que se escribió, y el seed
 * usa fechas relativas a propósito para no caducar. Aquí se pregunta cuál es el
 * día de la boda y se cuenta desde ahí.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión, y sin servidor de autenticación no hay pantalla que ver.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Documentos";

const documentos = copy.panel.documentos;

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

/**
 * Las secciones se localizan por su título, nunca por su posición.
 *
 * «Conseguido el» es la etiqueta correcta en tres formularios de esta pantalla
 * —el alta, la edición y el botón de un toque de cada fila— y eso está bien:
 * los tres preguntan lo mismo. Lo que no puede hacer el test es desambiguar con
 * `.first()`, porque entonces reordenar la pantalla cambia en silencio qué
 * campo se rellena y el test sigue en verde probando otra cosa.
 */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/**
 * La fila de un documento, por su `id` y no por su texto: al abrir la edición
 * el título pasa a estar dentro de un `<input>` y `hasText` dejaría de verlo.
 * Es la misma lección que dejaron los specs de gastos y de pagos.
 */
function filaDe(pagina: Page, documentoId: string) {
  return pagina.locator(`#documento-${documentoId}`);
}

/**
 * AFIRMA EL DESTINO QUE DEVOLVIÓ LA ACCIÓN, NO LA URL DE LA PESTAÑA.
 *
 * Es el arreglo del fallo intermitente #126. Entre que el servidor contesta con
 * su `?estado=` y que el enrutador de Next lo aplica hay un viaje más —la
 * petición `_rsc` a por la página nueva— y en una máquina de CI cargada ese
 * viaje a veces no termina dentro del plazo. Mirando sólo la barra de
 * direcciones, eso es indistinguible de «la acción no hizo nada», que es
 * exactamente lo contrario de lo que había pasado: la fila estaba escrita en la
 * base y la respuesta era correcta.
 *
 * Separadas las dos cosas, cada fallo señala a un sitio: si el destino no llega
 * o llega con otro estado, la acción se ha negado —y el mensaje dice a cuál—;
 * si llega el bueno y la pestaña no lo ha aplicado, se pide la pantalla destino
 * a pelo y se sigue. Ese `goto` de rescate no relaja nada: la afirmación de
 * verdad ya está hecha sobre lo que contestó el servidor.
 */
async function esperarEstado(pagina: Page, esperado: string) {
  const patron = new RegExp(`estado=${esperado}(?:[&;]|$)`);

  try {
    await expect
      .poll(() => patron.test(ultimoDestino(pagina) ?? ""), {
        timeout: 30_000,
        message: `la acción tenía que redirigir con «estado=${esperado}»`,
      })
      .toBe(true);
  } catch (fallo) {
    /*
      SI NO REDIRIGE, LO SIGUIENTE QUE HAY QUE SABER ES QUÉ SE VE. Una acción
      que lanza no cambia la URL: Next pinta el `error.tsx` del panel en el
      sitio y la dirección se queda como estaba. Se adjunta lo que la pantalla
      está diciendo para que el registro de CI lo distinga sin abrir la traza.
    */
    const enPantalla = await pagina
      .locator("main")
      .innerText()
      .catch(() => "(no se pudo leer la pantalla)");
    throw new Error(
      `${(fallo as Error).message}\n\nEl último destino devuelto fue: ${
        ultimoDestino(pagina) ?? "(ninguno)"
      }\n\nLo que hizo la pestaña:\n${laPista(pagina)}` +
        `\n\nLa pantalla decía:\n${enPantalla.slice(0, 600)}`,
    );
  }

  if (patron.test(pagina.url())) return;

  // El `;push` es cómo viaja la redirección por el camino de cliente; la ruta
  // es lo que va delante.
  const destino = (ultimoDestino(pagina) ?? "").split(";")[0];
  await pagina.goto(destino);
  await expect(pagina).toHaveURL(patron);
}

/** El día de la boda ±`dias`, contado por la base y en la zona de la boda. */
async function relativaALaBoda(dias: number): Promise<string> {
  const [fila] = await conBase(
    (sql) => sql<{ dia: string }[]>`
      select to_char(
               (c.fecha_hora_ceremonia at time zone c.zona_horaria)::date + ${dias}::int,
               'YYYY-MM-DD'
             ) as dia
        from public.configuracion_boda as c
    `,
  );
  return fila.dia;
}

/** Hoy, según la base y en la zona de la boda. Es lo que debe traer el campo. */
async function hoyEnLaBoda(): Promise<string> {
  const [fila] = await conBase(
    (sql) => sql<{ dia: string }[]>`
      select to_char((now() at time zone c.zona_horaria)::date, 'YYYY-MM-DD') as dia
        from public.configuracion_boda as c
    `,
  );
  return fila.dia;
}

interface FilaGuardada {
  id: string;
  estado: string;
  obtenido_en: string | null;
  caduca_en: string | null;
}

async function guardado(titulo: string): Promise<FilaGuardada | undefined> {
  const [fila] = await conBase(
    (sql) => sql<FilaGuardada[]>`
      select id, estado, to_char(obtenido_en, 'YYYY-MM-DD') as obtenido_en,
             to_char(caduca_en, 'YYYY-MM-DD') as caduca_en
        from public.documentos_boda
       where titulo = ${titulo}
    `,
  );
  return fila;
}

/** Lo que dice la VISTA, que es quien hace la cuenta que justifica el módulo. */
async function avisoDeLaBase(id: string): Promise<boolean> {
  const [fila] = await conBase(
    (sql) => sql<{ caduca_antes_de_la_boda: boolean }[]>`
      select caduca_antes_de_la_boda from public.v_documentos_boda where id = ${id}
    `,
  );
  return fila.caduca_antes_de_la_boda;
}

/**
 * SE LIMPIA SÓLO LO DE ESTE TEST, POR SU PREFIJO PROPIO.
 *
 * Con `fullyParallel` los tests corren a la vez fuera de CI, así que un barrido
 * por la marca entera borraría lo que otro acaba de sembrar y lo tumbaría a
 * mitad. Cada test se lleva lo suyo al empezar —para no arrastrar restos de una
 * ejecución cortada— y al acabar.
 */
async function limpiar(prefijo: string): Promise<void> {
  await conBase(
    (sql) => sql`delete from public.documentos_boda where titulo like ${`${prefijo}%`}`,
  );
}

/** Un documento puesto por SQL: lo que se prueba no es volver a teclear el alta. */
async function sembrar(campos: {
  titulo: string;
  estado: string;
  obtenidoEn: string | null;
  caducaEn: string | null;
}): Promise<string> {
  const [fila] = await conBase(
    (sql) => sql<{ id: string }[]>`
      insert into public.documentos_boda (titulo, de_quien, estado, obtenido_en, caduca_en)
      values (
        ${campos.titulo}, 'ambos', ${campos.estado}::public.estado_documento_boda,
        ${campos.obtenidoEn}::date, ${campos.caducaEn}::date
      )
      returning id
    `,
  );
  return fila.id;
}

test.describe("Los documentos de la boda civil", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => seguirLaPista(page));

  /**
   * CAMINO FELIZ · apuntar un papel que aguanta hasta después de la boda,
   * marcarlo conseguido de un toque y verlo salir de lo que falta por pedir.
   *
   * MARCAR CONSEGUIDO NO LO BORRA, y es la mitad importante: su caducidad sigue
   * vigilada. Un módulo que sacara el documento de la lista al conseguirlo
   * perdería justo el aviso para el que existe.
   */
  test("un documento apuntado se marca conseguido y sale de lo que falta", async ({ page }) => {
    const prefijo = `${MARCA} Feliz`;
    const titulo = `${prefijo} ${Date.now()}`;
    await limpiar(prefijo);

    // Caduca un mes DESPUÉS de la boda: este papel no tiene que avisar de nada.
    const caduca = await relativaALaBoda(30);

    await entrar(page);
    await page.goto(RUTA_DOCUMENTOS);

    const alta = seccion(page, documentos.nuevoTitulo);
    await alta.getByLabel(documentos.campoTitulo, { exact: true }).fill(titulo);
    await alta
      .getByLabel(documentos.campoDeQuien, { exact: true })
      .selectOption({ label: documentos.titulares.novia });
    await alta
      .getByLabel(documentos.campoDonde, { exact: true })
      .fill("(DES) Registro Civil de pruebas");
    await alta.getByLabel(documentos.campoCaduca, { exact: true }).fill(caduca);

    olvidarDestinos(page);
    await alta.getByRole("button", { name: documentos.apuntar }).click();
    await esperarEstado(page, "apuntado");

    // 1 · Está en la base, pendiente y sin fecha de obtención: el `check` de la
    //     tabla exige que esas dos cosas vayan juntas.
    const recienApuntado = await guardado(titulo);
    expect(recienApuntado, "el documento tiene que quedar escrito").toBeDefined();
    expect(recienApuntado!.estado).toBe("pendiente");
    expect(recienApuntado!.obtenido_en, "sin conseguir no hay fecha de obtención").toBeNull();
    expect(recienApuntado!.caduca_en).toBe(caduca);

    const id = recienApuntado!.id;

    // 2 · Y sale donde tiene que salir: en lo que falta por pedir.
    const porPedir = seccion(page, documentos.grupos.pendiente);
    await expect(porPedir.locator(`#documento-${id}`)).toBeVisible();

    /*
      EL CAMPO LLEGA RELLENO CON EL DÍA DE HOY, Y ES EL DE LA BASE.

      Es lo que convierte «marcar conseguido» en un toque. Se compara con lo que
      dice la base en la zona horaria de la boda y no con `new Date()` del
      proceso de test: si un día alguien calcula esa fecha con el reloj del
      navegador, aquí se vería —Playwright corre en Europe/Madrid y el servidor
      de CI en UTC, así que media parte del año no coinciden.
    */
    const fila = filaDe(page, id);
    const campoFecha = fila.getByLabel(documentos.campoObtenido, { exact: true });
    await expect(campoFecha, "el campo tiene que venir relleno").toHaveValue(
      await hoyEnLaBoda(),
    );

    const marcar = fila.getByRole("button", { name: documentos.marcarConseguido });
    await expect(marcar).toBeEnabled();
    olvidarDestinos(page);
    await marcar.click();
    await esperarEstado(page, "conseguido");

    // 3 · La base lo da por conseguido, con su fecha y no con un booleano.
    const conseguido = await guardado(titulo);
    expect(conseguido!.estado, "marcar conseguido cambia el estado").toBe("conseguido");
    expect(conseguido!.obtenido_en, "y escribe la fecha en la que se recogió").not.toBeNull();

    // 4 · Y se ve: ha salido de lo que falta y está entre los conseguidos, sin
    //     haberse borrado por el camino.
    await expect(
      seccion(page, documentos.grupos.pendiente).locator(`#documento-${id}`),
      "conseguido ya no cuenta como pendiente",
    ).toHaveCount(0);
    await expect(
      seccion(page, documentos.grupos.conseguido).locator(`#documento-${id}`),
      "y sigue estando, ahora entre los conseguidos",
    ).toBeVisible();

    // 5 · Este aguanta hasta después de la boda, así que no lleva aviso.
    expect(await avisoDeLaBase(id), "no caduca antes de la boda").toBe(false);
    await expect(filaDe(page, id).getByText(documentos.caducaAntes)).toHaveCount(0);

    await limpiar(prefijo);
  });

  /**
   * EL CASO QUE JUSTIFICA EL MÓDULO · un papel conseguido que caduca antes de
   * la boda sale avisado igualmente.
   *
   * Es el error de verdad de este dominio, y no se parece a un formulario mal
   * rellenado: nadie ha hecho nada mal. El certificado se pidió, se recogió y
   * está en la carpeta — y no sirve, porque el día de la boda ya habrá
   * caducado. Sin este aviso, la pantalla lo enseña como resuelto y nadie
   * vuelve a mirarlo hasta el juzgado.
   */
  test("un conseguido que caduca antes de la boda aparece avisado", async ({ page }) => {
    const prefijo = `${MARCA} Caducado`;
    const titulo = `${prefijo} ${Date.now()}`;
    await limpiar(prefijo);

    // Recogido hace mucho y caducado diez días antes de la boda: vigente hoy,
    // inútil el día que hace falta.
    const id = await sembrar({
      titulo,
      estado: "conseguido",
      obtenidoEn: await relativaALaBoda(-120),
      caducaEn: await relativaALaBoda(-10),
    });

    // 1 · La cuenta la hace la BASE, y es la afirmación que da sentido al resto.
    expect(
      await avisoDeLaBase(id),
      "la vista tiene que comparar la caducidad con la fecha de la boda",
    ).toBe(true);

    await entrar(page);
    await page.goto(RUTA_DOCUMENTOS);

    // 2 · Está entre los conseguidos: el aviso NO es «te falta este papel».
    await expect(
      seccion(page, documentos.grupos.conseguido).locator(`#documento-${id}`),
      "el documento está conseguido, y aun así avisa",
    ).toBeVisible();

    /*
      3 · Y lleva su PALABRA, no sólo el fondo rojo. Es criterio de aceptación y
      no un adorno: un color no lo lee ni un daltónico, ni un lector de
      pantalla, ni nadie con el sol de junio dando en el móvil.
    */
    await expect(
      filaDe(page, id).getByText(documentos.caducaAntes),
      "la fila tiene que decirlo con letras",
    ).toBeVisible();

    // 4 · Y sale arriba del todo, con nombre: quien abre la pantalla no debería
    //     tener que bajar hasta los conseguidos para enterarse.
    await expect(seccion(page, documentos.caducanTitulo).getByText(titulo)).toBeVisible();

    await limpiar(prefijo);
  });

  /**
   * CASO DE ERROR · marcar «conseguido» sin decir cuándo se recogió.
   *
   * La base lo impide con un `check`, pero un fallo de restricción no le dice
   * nada a quien está rellenando un formulario. La acción lo para antes y
   * explica QUÉ falta y para qué sirve — sin la fecha no hay forma de saber si
   * el plazo de validez sigue vivo, que es la razón de ser del módulo.
   */
  test("un conseguido sin fecha de obtención no se guarda y se explica", async ({ page }) => {
    const prefijo = `${MARCA} SinFecha`;
    const titulo = `${prefijo} ${Date.now()}`;
    await limpiar(prefijo);

    await entrar(page);
    await page.goto(RUTA_DOCUMENTOS);

    const alta = seccion(page, documentos.nuevoTitulo);
    await alta.getByLabel(documentos.campoTitulo, { exact: true }).fill(titulo);
    await alta
      .getByLabel(documentos.campoEstado, { exact: true })
      .selectOption({ label: documentos.estados.conseguido });

    olvidarDestinos(page);
    await alta.getByRole("button", { name: documentos.apuntar }).click();
    await esperarEstado(page, "sin-fecha-obtencion");

    /*
      SE BUSCA EL AVISO POR SU TEXTO Y NO POR `getByRole("alert")`. Next pinta
      su propio anunciador de ruta —un `div` con `role="alert"` que lee el
      título de la página—, así que el papel `alert` devuelve DOS elementos y
      Playwright se niega a elegir. El texto sale del copy, no copiado a mano.
    */
    await expect(page.getByText(documentos.errorSinFechaObtencion)).toBeVisible();

    expect(
      await guardado(titulo),
      "un documento a medio contestar no puede quedar escrito",
    ).toBeUndefined();

    await limpiar(prefijo);
  });

  /**
   * BLOQUEANTE (regla 4) · `anon` no puede leer los documentos de la boda.
   *
   * Es lo más privado que hay en esta base: el expediente lleva nombres, fechas
   * de nacimiento y de dónde es cada uno. Se comprueba por debajo de la
   * pantalla, con el rol de la web pública puesto a mano, porque probar sólo
   * que el panel pide contraseña no dice nada sobre quién puede leer la tabla.
   *
   * SE COMPRUEBAN LA TABLA Y LA VISTA. La vista es `security_invoker`, así que
   * debería negarse igual — pero es exactamente el tipo de objeto que se crea
   * un día con los permisos de su dueño y se convierte en la puerta de atrás de
   * la tabla que protege.
   */
  test("anon no puede leer los documentos de la boda", async () => {
    for (const objeto of ["documentos_boda", "v_documentos_boda"]) {
      const intento = await conBase((sql) =>
        sql
          .begin(async (tx) => {
            await tx`set local role anon`;
            return tx`select 1 as uno from public.${tx(objeto)} limit 1`;
          })
          .then(
            (filas) => ({ negado: false, codigo: "", cuantas: (filas as unknown[]).length }),
            (error: { code?: string }) => ({
              negado: true,
              codigo: error.code ?? "(sin código)",
              cuantas: 0,
            }),
          ),
      );

      expect(
        intento.negado,
        `anon no puede leer public.${objeto}: la base tiene que negarse, y devolvió ${intento.cuantas} filas`,
      ).toBe(true);

      /*
        SE COMPRUEBA EL CÓDIGO Y NO EL TEXTO. `42501` es
        «insufficient_privilege» y significa lo mismo en cualquier servidor; el
        mensaje depende del idioma con el que arrancó Postgres, y un test que se
        cae al cambiar `lc_messages` no está probando la seguridad, está
        probando el idioma.
      */
      expect(intento.codigo, "y el motivo tiene que ser falta de permiso").toBe("42501");
    }
  });
});
