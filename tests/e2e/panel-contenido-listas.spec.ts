import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_CONTENIDO, RUTA_PANEL } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-129 · Las cuatro listas de contenido, escritas desde el panel
 *
 * LO QUE HAY QUE DEMOSTRAR NO ES QUE EL FORMULARIO GUARDE, sino que lo que se
 * escribe aquí sale en la web y que lo que se retira deja de salir. Hasta este
 * ticket, el programa, las rutas, el dress code y las preguntas sólo se podían
 * tocar por SQL: un test que mirase únicamente el panel daría por bueno
 * exactamente el fallo que #163 viene a cerrar.
 *
 * Por eso cada paso se comprueba en tres sitios: la decisión del servidor, la
 * base de datos y la landing. Con RLS de por medio esto no es celo — una
 * escritura prohibida no da error, devuelve cero filas—, así que sin mirar la
 * base un «ya está en la web» puede ser mentira.
 *
 * SE DEJA TODO COMO ESTABA. Las filas de prueba se borran y la visibilidad de
 * las secciones se restaura pase lo que pase: sin eso, un fallo aquí deja la
 * landing sin dress code y `regalos-dresscode.spec.ts` falla por un motivo que
 * no tiene nada que ver con lo que está probando.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión, y sin servidor de autenticación no hay pantalla que ver.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

/** Con esto empieza todo lo que escribe este fichero, y por esto se borra. */
const MARCA = "E2E129";

/** Lo que se afirma cuando la acción no dejó ningún destino: falla y se lee. */
const SIN_DESTINO = "(la acción no redirigió)";

/** Las secciones que este fichero enciende y apaga. */
const SECCIONES_TOCADAS = ["dresscode", "programa", "preboda"] as const;

const comun = copy.panel.contenido.listas.comun;

test.describe.configure({ mode: "serial" });

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

interface Consejo {
  id: string;
  titulo: string;
  texto: string;
  orden: number;
  publicado: boolean;
}

function leerConsejos(): Promise<Consejo[]> {
  return conBase(
    (sql) => sql<Consejo[]>`
      select id, titulo, texto, orden, publicado
        from public.consejos_vestimenta
       where titulo like ${`${MARCA}%`}
       order by orden
    `,
  );
}

interface Hito {
  id: string;
  titulo: string;
  momento: string;
}

function leerHitos(): Promise<Hito[]> {
  return conBase(
    (sql) => sql<Hito[]>`
      select id, titulo, momento::text as momento
        from public.hitos_programa
       where titulo like ${`${MARCA}%`}
       order by orden
    `,
  );
}

function borrarLoDePrueba(): Promise<void> {
  return conBase(async (sql) => {
    await sql`delete from public.consejos_vestimenta where titulo like ${`${MARCA}%`}`;
    await sql`delete from public.hitos_programa where titulo like ${`${MARCA}%`}`;
  });
}

function verVisibilidad(): Promise<{ seccion: string; visible: boolean }[]> {
  return conBase(
    (sql) => sql<{ seccion: string; visible: boolean }[]>`
      select seccion::text as seccion, visible
        from public.secciones_landing
       where seccion::text = any(${SECCIONES_TOCADAS as unknown as string[]})
    `,
  );
}

function encenderSeccion(seccion: string, visible: boolean): Promise<unknown> {
  return conBase(
    (sql) => sql`
      update public.secciones_landing
         set visible = ${visible}
       where seccion = ${seccion}::public.seccion_landing
    `,
  );
}

async function entrar(pagina: Page) {
  // Se engancha ANTES de la primera navegación: lo que hace falta saber es a
  // dónde dijo la acción que fuera, y eso sólo se ve escuchando desde el
  // principio.
  seguirLaPista(pagina);
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

/**
 * ESPERA A QUE LA ACCIÓN HAYA DECIDIDO, Y DEJA LA PANTALLA EN SU DESTINO.
 *
 * Es la misma pieza que usan `panel-medios`, `panel-proveedores` y
 * `panel-contenido`, y por el mismo motivo: #126. El servidor responde con su
 * `x-action-redirect` y el enrutador de cliente no siempre lo aplica, así que
 * afirmar sobre `role="status"` justo después del clic falla con «element(s)
 * not found» aunque la acción haya ido perfecta.
 *
 * NO ES AFLOJAR EL TEST: se sigue exigiendo el estado EXACTO —`creada` y no
 * `sin-permiso`, que es el diagnóstico entero— y todo lo que viene después. Lo
 * único que deja de afirmarse es que el navegador aplique la redirección, que
 * es #126 y tiene su propia incidencia.
 */
async function esperarEstado(pagina: Page, esperado: string, porDefecto: string) {
  const destinoEsperado = `estado=${esperado}`;

  try {
    await expect
      .poll(() => ultimoDestino(pagina) ?? SIN_DESTINO, { timeout: 15_000 })
      .toContain(destinoEsperado);
  } catch (fallo) {
    throw new Error(
      `${(fallo as Error).message}\n\nLo que hizo la pestaña:\n${laPista(pagina)}`,
    );
  }

  const destino = ultimoDestino(pagina);
  // Consumido: el destino de esta acción no puede valer por el de la siguiente.
  olvidarDestinos(pagina);

  // Y se va al destino SIEMPRE, aunque la barra ya lo lleve puesto: un rescate
  // anterior deja esa misma dirección, y «ya estoy ahí» acabaría mirando la
  // pantalla de hace dos pasos, sin lo que se acaba de escribir.
  await pagina.goto(destino ?? `${porDefecto}?${destinoEsperado}`);
  await pagina.waitForLoadState("networkidle");
}

/**
 * LA LISTA DE FICHAS, Y NO CUALQUIER LISTA DE LA PÁGINA.
 *
 * En esta pantalla hay dos más: el menú del panel y, en el programa, el
 * conmutador de los dos días. Contando `getByRole("listitem")` a secas se
 * contarían las tres. Se acota por el nombre accesible que la propia lista
 * lleva, que es el título de la lista en su `h2` invisible.
 */
function laLista(pagina: Page, titulo: string): Locator {
  return pagina.getByRole("list", { name: titulo });
}

/** Una ficha, localizada por su título y no por su posición. */
function fichaDe(pagina: Page, titulo: string, ficha: string): Locator {
  return laLista(pagina, titulo)
    .getByRole("listitem")
    .filter({ has: pagina.getByRole("heading", { name: ficha }) });
}

/**
 * UN BOTÓN DE UNA FICHA, POR SU NOMBRE ACCESIBLE ENTERO.
 *
 * En una lista de dieciocho hay dieciocho «Borrar», así que cada botón lleva
 * dentro el título de su ficha en texto oculto. Se busca por el nombre completo
 * —«Borrar» más el título— y con `exact`, que de paso comprueba lo que exige la
 * regla del nombre en la etiqueta (WCAG 2.5.3): el rótulo VISIBLE va entero y
 * al principio del nombre accesible. Con un `aria-label` esto no se cumpliría,
 * y quien maneja el ordenador por voz dice lo que lee.
 */
function botonDe(ficha: Locator, rotulo: string, titulo: string): Locator {
  return ficha.getByRole("button", { name: `${rotulo} ${titulo}`, exact: true });
}

/**
 * EL CONMUTADOR DE LOS DOS DÍAS, Y NO EL MENÚ DEL PANEL.
 *
 * «Día de la boda» es además el nombre de un módulo del panel —el guion de la
 * jornada—, así que buscar ese enlace a secas encuentra dos y Playwright se
 * planta. El conmutador es un `nav` con el título de la lista por nombre
 * accesible; el menú del panel tiene el suyo.
 */
function conmutadorDe(pagina: Page, titulo: string): Locator {
  return pagina.getByRole("navigation", { name: titulo });
}

/**
 * EL AVISO DE ESTA PANTALLA, Y NO EL DE NEXT.
 *
 * El anunciador de rutas de Next también es `role="alert"`, así que buscarlo a
 * secas encuentra dos y Playwright se planta. Los avisos del panel viven dentro
 * de su `<main>`; el de Next, fuera. Es la misma trampa que ya documenta
 * `panel-ajustes.spec.ts`.
 */
function avisoDe(pagina: Page): Locator {
  return pagina.locator("main").getByRole("alert");
}

/**
 * El formulario de alta, que es el único que no lleva ficha: los de edición
 * mandan el identificador de la suya en un campo oculto.
 */
function formularioDeAlta(pagina: Page): Locator {
  return pagina
    .locator("form")
    .filter({ has: pagina.getByRole("button", { name: comun.anadir, exact: true }) });
}

const RUTA_DRESSCODE = `${RUTA_CONTENIDO}/dresscode`;
const RUTA_PROGRAMA = `${RUTA_CONTENIDO}/programa`;
const DRESSCODE = copy.panel.contenido.listas.dresscode;
const PROGRAMA = copy.panel.contenido.listas.programa;

test.describe("Las listas de contenido de la web", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: sólo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeAll(async () => {
    // Se parte de las secciones encendidas para que «no sale en la web» sólo
    // pueda significar una cosa. Apagarlas es lo que prueba un test concreto.
    for (const seccion of SECCIONES_TOCADAS) await encenderSeccion(seccion, true);
    await borrarLoDePrueba();
  });

  /*
    SE RESTAURA A «ENCENDIDA», NO A LO QUE HUBIERA. Y no es pereza de no guardar
    el estado previo: las tres nacen visibles en las migraciones, y guardarlo
    sería peor. En CI esto se reintenta hasta dos veces, así que una primera
    pasada que fallara dejando el dress code apagado haría que el reintento
    guardase «apagado» como original y lo dejase así al terminar — y entonces
    quien falla es `regalos-dresscode.spec.ts`, que ni toca esta pantalla. Un
    fallo tiene que salir en el fichero que lo causa.
  */
  test.afterAll(async () => {
    await borrarLoDePrueba();
    for (const seccion of SECCIONES_TOCADAS) await encenderSeccion(seccion, true);
  });

  test("una ficha nueva sale en la web, retirarla la esconde y borrarla la quita", async ({
    page,
  }) => {
    const titulo = `${MARCA} Ellas`;
    const texto = `${MARCA} Vestido largo, y zapato que aguante hierba.`;

    await entrar(page);
    await page.goto(RUTA_DRESSCODE);

    // --- alta ---------------------------------------------------------------
    const alta = formularioDeAlta(page);
    await alta.getByLabel(DRESSCODE.tituloConsejo).fill(titulo);
    await alta.getByLabel(DRESSCODE.texto).fill(texto);
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();

    await esperarEstado(page, "creada", RUTA_DRESSCODE);
    await expect(page.getByRole("status").filter({ hasText: comun.avisoCreada })).toBeVisible();

    const [recienNacida] = await leerConsejos();
    expect(
      recienNacida,
      "el alta tiene que estar en la base, no sólo en la pantalla",
    ).toBeTruthy();
    expect(recienNacida.texto).toBe(texto);
    expect(recienNacida.publicado, "nace publicada: quien la escribe quiere que se vea").toBe(
      true,
    );

    // Y en la web, que es lo único que importa de verdad.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    await expect(page.getByText(texto)).toBeVisible();

    // --- retirar ------------------------------------------------------------
    await page.goto(RUTA_DRESSCODE);
    await expect(fichaDe(page, DRESSCODE.titulo, titulo)).toContainText(comun.enLaWeb);

    await botonDe(fichaDe(page, DRESSCODE.titulo, titulo), comun.retirar, titulo).click();

    await esperarEstado(page, "retirada", RUTA_DRESSCODE);

    const [retirada] = await leerConsejos();
    expect(retirada.publicado).toBe(false);
    expect(retirada.texto, "retirar no borra: el texto sigue guardado").toBe(texto);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: titulo })).toHaveCount(0);

    // --- borrar, con su pregunta --------------------------------------------
    await page.goto(RUTA_DRESSCODE);
    await expect(fichaDe(page, DRESSCODE.titulo, titulo)).toContainText(comun.retirada);

    await botonDe(fichaDe(page, DRESSCODE.titulo, titulo), comun.borrar, titulo).click();

    await esperarEstado(page, "confirmar-borrado", RUTA_DRESSCODE);
    await expect(
      avisoDe(page),
      "borrar no puede pasar de un solo clic: una ficha borrada no vuelve",
    ).toHaveText(comun.borrarPregunta.replace("{ficha}", titulo));

    expect(await leerConsejos(), "preguntar no es borrar").toHaveLength(1);

    await page.getByRole("button", { name: comun.borrarConfirmar }).click();
    await esperarEstado(page, "borrada", RUTA_DRESSCODE);

    expect(await leerConsejos()).toHaveLength(0);
    await expect(fichaDe(page, DRESSCODE.titulo, titulo)).toHaveCount(0);
  });

  test("al borrar se ofrece retirarla, que es lo que casi siempre se quería", async ({
    page,
  }) => {
    /*
      LA SALIDA SUAVE. Quien llega a la pregunta ya ha pulsado «Borrar» una vez,
      así que repetirle la advertencia no ayuda: lo que ayuda es ofrecerle lo que
      probablemente buscaba —que deje de verse— sin perder lo escrito.
    */
    const titulo = `${MARCA} Ellos`;

    await entrar(page);
    await page.goto(RUTA_DRESSCODE);

    const alta = formularioDeAlta(page);
    await alta.getByLabel(DRESSCODE.tituloConsejo).fill(titulo);
    await alta.getByLabel(DRESSCODE.texto).fill(`${MARCA} Traje, y corbata si apetece.`);
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();
    await esperarEstado(page, "creada", RUTA_DRESSCODE);

    await botonDe(fichaDe(page, DRESSCODE.titulo, titulo), comun.borrar, titulo).click();
    await esperarEstado(page, "confirmar-borrado", RUTA_DRESSCODE);

    await page.getByRole("button", { name: comun.borrarMejorRetirar }).click();
    await esperarEstado(page, "retirada", RUTA_DRESSCODE);

    const [sigueAhi] = await leerConsejos();
    expect(sigueAhi, "la salida suave no puede borrar nada").toBeTruthy();
    expect(sigueAhi.publicado).toBe(false);
  });

  test("el conmutador del programa escribe en el día que toca", async ({ page }) => {
    const deLaVispera = `${MARCA} Cena en el pueblo`;

    await entrar(page);
    await page.goto(RUTA_PROGRAMA);

    // De partida se está en el día de la boda, que es la primera pestaña.
    const conmutador = conmutadorDe(page, PROGRAMA.titulo);
    await expect(
      conmutador.getByRole("link", { name: PROGRAMA.boda }),
      "la pestaña del día de la boda es la que se ve al llegar",
    ).toHaveAttribute("aria-current", "page");

    await conmutador.getByRole("link", { name: PROGRAMA.preboda }).click();
    await expect(page).toHaveURL(/variante=preboda/);

    const alta = formularioDeAlta(page);
    await alta.getByLabel(PROGRAMA.hora).fill("21:00");
    await alta.getByLabel(PROGRAMA.titulo_).fill(deLaVispera);
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();

    await esperarEstado(page, "creada", RUTA_PROGRAMA);

    const [hito] = await leerHitos();
    expect(hito, "el hito tiene que existir").toBeTruthy();
    expect(hito.momento, "escrito en la víspera, guardado en la víspera").toBe("preboda");

    // Se ve en su pestaña...
    await page.goto(`${RUTA_PROGRAMA}?variante=preboda`);
    await expect(fichaDe(page, PROGRAMA.titulo, deLaVispera)).toBeVisible();

    // ...y no en la otra, que es lo que hace que el conmutador sirva de algo.
    await page.goto(`${RUTA_PROGRAMA}?variante=boda`);
    await expect(laLista(page, PROGRAMA.titulo).getByRole("listitem").first()).toBeVisible();
    await expect(fichaDe(page, PROGRAMA.titulo, deLaVispera)).toHaveCount(0);
  });

  test("un obligatorio en blanco no guarda nada, y se dice cuál falta", async ({ page }) => {
    /*
      SE MANDA UN ESPACIO, NO EL CAMPO VACÍO. El `required` del navegador ya para
      lo vacío; lo que este test defiende es la validación del SERVIDOR, que es
      la que queda cuando el `required` no está —bundle a medio cargar, o un
      formulario mandado a mano—. Un espacio pasa el `required` y no es un
      título.
    */
    await entrar(page);
    await page.goto(RUTA_DRESSCODE);

    const alta = formularioDeAlta(page);
    await alta.getByLabel(DRESSCODE.tituloConsejo).fill("   ");
    await alta.getByLabel(DRESSCODE.texto).fill(`${MARCA} Un texto que sí está escrito.`);
    await alta.getByRole("button", { name: comun.anadir, exact: true }).click();

    await esperarEstado(page, "falta", RUTA_DRESSCODE);

    await expect(
      page.getByText(comun.errorFalta.replace("{campo}", DRESSCODE.tituloConsejo)),
      "el error va pegado al campo que falla, no sólo arriba",
    ).toBeVisible();

    expect(await leerConsejos(), "no se guarda nada a medias").toHaveLength(0);
  });

  test("si la sección está apagada se avisa, y se puede encender desde aquí", async ({
    page,
  }) => {
    /*
      EL DESCONCIERTO DE #163, EN PEQUEÑO: se escriben tres fichas, no se ve
      ninguna en la web, y no hay forma de saber por qué. Con la sección apagada
      la pantalla lo dice y ofrece el interruptor, en vez de dejar que alguien lo
      descubra por eliminación.
    */
    await encenderSeccion("dresscode", false);

    await entrar(page);
    await page.goto(RUTA_DRESSCODE);

    const aviso = comun.seccionApagada.replace(
      "{seccion}",
      copy.navegacion.secciones.dresscode,
    );
    await expect(page.getByText(aviso)).toBeVisible();

    const encender = comun.encenderSeccion.replace(
      "{seccion}",
      copy.navegacion.secciones.dresscode,
    );
    await page.getByRole("button", { name: encender }).click();

    await esperarEstado(page, "mostrada", RUTA_CONTENIDO);

    const [dresscode] = (await verVisibilidad()).filter((fila) => fila.seccion === "dresscode");
    expect(dresscode.visible, "el interruptor tiene que haber girado en la base").toBe(true);

    // Y de vuelta en la lista ya no hay nada que avisar.
    await page.goto(RUTA_DRESSCODE);
    await expect(page.getByText(aviso)).toHaveCount(0);
  });

  test("mover una ficha cambia el orden en la base, y en el mismo sentido", async ({
    page,
  }) => {
    /*
      SE COMPRUEBA CONTRA LA BASE PORQUE ES EL FALLO QUE NO SE VE: si el botón
      del primero mueve la ficha equivocada, la lista queda ordenada de otra
      manera y hay que acordarse de cómo estaba para darse cuenta. La permuta en
      sí tiene su unitario; lo que se prueba aquí es que lo que decide se
      escribe, que son N `update` y RLS puede callar en cualquiera de ellos.
    */
    const primera = `${MARCA} Primera`;
    const segunda = `${MARCA} Segunda`;

    await entrar(page);

    for (const titulo of [primera, segunda]) {
      await page.goto(RUTA_DRESSCODE);
      const alta = formularioDeAlta(page);
      await alta.getByLabel(DRESSCODE.tituloConsejo).fill(titulo);
      await alta.getByLabel(DRESSCODE.texto).fill(`${MARCA} Texto de ${titulo}.`);
      await alta.getByRole("button", { name: comun.anadir, exact: true }).click();
      await esperarEstado(page, "creada", RUTA_DRESSCODE);
    }

    expect(
      (await leerConsejos()).map((fila) => fila.titulo),
      "una ficha nueva nace la última, que es donde la pone quien la escribe",
    ).toEqual([primera, segunda]);

    await botonDe(
      fichaDe(page, DRESSCODE.titulo, primera),
      copy.panel.contenido.bajarOrden,
      primera,
    ).click();

    await esperarEstado(page, "movida", RUTA_DRESSCODE);

    expect((await leerConsejos()).map((fila) => fila.titulo)).toEqual([segunda, primera]);

    // La última de la lista no tiene a dónde bajar, así que ese botón no se
    // pinta: apagado se leería como «esto está roto».
    await expect(fichaDe(page, DRESSCODE.titulo, primera)).toBeVisible();
    await expect(
      botonDe(
        fichaDe(page, DRESSCODE.titulo, primera),
        copy.panel.contenido.bajarOrden,
        primera,
      ),
    ).toHaveCount(0);
  });
});
