import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL, RUTA_TAREAS } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-80/81/82 · Las tareas de la boda
 *
 * CUATRO COSAS, Y LAS CUATRO CONTRA LA BASE:
 *
 *   1. El camino feliz entero —apuntar, completar, borrar— comprobando en la
 *      base después de cada paso. Un panel que dice «guardado» sin escribir
 *      pasaría cualquier test que mire sólo el HTML, y con RLS de por medio ese
 *      fallo es especialmente fácil: una escritura prohibida no da error,
 *      devuelve cero filas.
 *   2. El caso de error: sin título no se guarda, y se dice por qué. Se manda
 *      el formulario POR ENCIMA del `required` del navegador, porque una
 *      validación que sólo vive en el HTML no es una validación.
 *   3. El tablero movido SÓLO CON EL TECLADO. Es la mitad del ticket: arrastrar
 *      es cómodo con ratón y es imposible sin él, y esta pantalla se usa la
 *      víspera, de pie y con el móvil.
 *   4. Generar la plantilla dos veces. Lo que se afirma no es el aviso: es que
 *      en la base no hay dos tareas colgando de la misma fila de plantilla.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión, y sin servidor de autenticación no hay pantalla que ver.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Tareas";

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
 * LAS SECCIONES SE LOCALIZAN POR SU TÍTULO Y NO POR SU POSICIÓN.
 *
 * «Título», «Prioridad» y «Para cuándo» son la etiqueta correcta en dos
 * formularios de esta pantalla —el alta y la edición— y eso está bien: son los
 * mismos campos. Lo que no puede hacer el test es resolver la ambigüedad con
 * `.first()`, porque entonces reordenar la pantalla cambia en silencio qué
 * formulario se rellena y el test sigue en verde probando otra cosa.
 */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/** La tarjeta de una tarea, esté en la lista o en su columna del tablero. */
function tarjeta(pagina: Page, id: string) {
  return pagina.locator(`#tarea-${id}`);
}

/** El rótulo del botón que mueve una tarjeta a una columna concreta. */
function rotuloMoverA(estado: string): string {
  return copy.panel.tareas.moverA.replace("{estado}", estado);
}

/**
 * Los identificadores de las tarjetas de una columna, en el orden en que se
 * pintan. El orden de la página ES el orden de la columna, y es lo único contra
 * lo que tiene sentido afirmar una permuta.
 */
async function ordenDeLaColumna(pagina: Page, columna: string): Promise<string[]> {
  return seccion(pagina, columna)
    .locator('li[id^="tarea-"]')
    .evaluateAll((tarjetas) =>
      tarjetas.map((tarjeta) => (tarjeta as HTMLElement).id.replace("tarea-", "")),
    );
}

/**
 * ¿A QUÉ ESTADO MANDÓ LA ACCIÓN? Y DEJA LA PANTALLA DONDE ESA REDIRECCIÓN DECÍA.
 *
 * Se afirma sobre **el destino que devolvió el servidor**, no sobre la URL de la
 * barra. Los dos dicen lo mismo cuando todo va bien, pero el destino es el dato
 * de verdad: es la decisión de la acción, y llega aunque el navegador no se
 * mueva — que es exactamente lo que rompe #126.
 *
 * EL RESCATE VA AL DESTINO COMPLETO Y NO A UNO RECONSTRUIDO. Aquí importa: la
 * confirmación de borrado viaja como `?estado=confirmar-borrado&tarea=<id>`, y
 * un `goto` que se quedara con el estado perdería el `tarea=` — la pantalla
 * volvería sin el botón de confirmar y el fallo apuntaría al sitio equivocado.
 * Se navega a lo que dijo el servidor, letra por letra, que es lo que habría
 * hecho el navegador.
 */
async function esperarEstado(pagina: Page, esperado: string, respaldo = RUTA_TAREAS) {
  await esperarAlgunEstado(pagina, [esperado], respaldo);
}

/**
 * Igual, pero admitiendo varios finales.
 *
 * Lo necesita la plantilla: la PRIMERA generación crea tareas en una base
 * limpia y no crea ninguna si otra pasada ya las creó, y las dos respuestas son
 * correctas. Lo que sí es exigible es la segunda, y esa se afirma exacta.
 */
async function esperarAlgunEstado(pagina: Page, esperados: string[], respaldo = RUTA_TAREAS) {
  const patron = new RegExp(`estado=(${esperados.join("|")})(&|$)`);

  try {
    await expect
      .poll(() => ultimoDestino(pagina) ?? pagina.url(), { timeout: 15_000 })
      .toMatch(patron);
  } catch (fallo) {
    /*
      SI NO REDIRIGE, LO SIGUIENTE QUE HAY QUE SABER ES QUÉ SE VE. Una acción
      que lanza no cambia la URL: Next pinta el `error.tsx` del panel en el
      sitio y la dirección se queda como estaba. Visto sólo desde la URL, eso es
      indistinguible de «no ha pasado nada», y son dos cosas muy distintas.
    */
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
  // Consumido: el destino de esta acción no puede valer por el de la siguiente.
  olvidarDestinos(pagina);

  if (!patron.test(pagina.url())) {
    console.warn(`#126: la pestaña no siguió la redirección a ${destino ?? "(sin destino)"}.`);
    await pagina.goto(destino ?? `${respaldo}?estado=${esperados[0]}`);
  }

  /*
    Y SE ESPERA A QUE LA PANTALLA NUEVA SE ASIENTE ANTES DE DEVOLVER EL CONTROL:
    cada paso de este spec pulsa algo de la página que acaba de llegar, así que
    sin esto cada uno corre una carrera contra la hidratación.
  */
  await pagina.waitForLoadState("networkidle");
}

test.describe("El módulo de tareas", () => {
  /*
    Cada paso de esta pantalla es un viaje completo: escribir en la base,
    redirigir, y repintar entera una página `force-dynamic` con sus consultas.
    En el trabajo de CI que levanta Supabase en Docker eso no cabe en el plazo
    por defecto, y el síntoma no es un fallo honesto sino uno que aparece en un
    punto distinto en cada intento.
  */
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => seguirLaPista(page));

  test.afterAll(async () => {
    if (!cadena) return;
    // Sólo lo nuestro. Las tareas generadas desde la plantilla NO se borran: son
    // datos legítimos de la boda, y la generación es idempotente de todas formas.
    await conBase((sql) => sql`delete from public.tareas where titulo like ${`${MARCA}%`}`);
  });

  /**
   * CAMINO FELIZ · se apunta, se completa y se borra, comprobando la base en
   * cada paso.
   *
   * COMPLETAR NO ESCRIBE `completada_en` DESDE EL PANEL: lo sella el trigger
   * `sellar_tarea_completada`. Que la fecha esté puesta después de marcar hecha
   * es la prueba de que el camino pasa por la base y no por un campo oculto que
   * alguien se acordó de rellenar.
   */
  test("se apunta una tarea, se completa y se borra", async ({ page }) => {
    const titulo = `${MARCA} Pedir el certificado ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_TAREAS);

    const alta = seccion(page, copy.panel.tareas.nuevaTitulo);
    await alta.getByLabel(copy.panel.tareas.campoTitulo, { exact: true }).fill(titulo);
    await alta
      .getByLabel(copy.panel.tareas.campoPrioridad, { exact: true })
      .selectOption("alta");
    await alta.getByRole("button", { name: copy.panel.tareas.crear }).click();

    await esperarEstado(page, "creada");
    await expect(page.getByText(copy.panel.tareas.avisoCreada)).toBeVisible();

    const [creada] = await conBase(
      (sql) => sql<{ id: string; estado: string; prioridad: string }[]>`
        select id, estado, prioridad from public.tareas where titulo = ${titulo}
      `,
    );
    expect(creada?.estado, "una tarea nueva nace pendiente").toBe("pendiente");
    expect(creada.prioridad).toBe("alta");

    // Y se ve en la pantalla, en su tarjeta.
    await expect(tarjeta(page, creada.id)).toContainText(titulo);

    // Completar.
    await tarjeta(page, creada.id)
      .getByRole("button", { name: copy.panel.tareas.completar })
      .click();
    await esperarEstado(page, "completada");

    const [hecha] = await conBase(
      (sql) => sql<{ estado: string; completada_en: string | null }[]>`
        select estado, completada_en from public.tareas where id = ${creada.id}
      `,
    );
    expect(hecha.estado).toBe("hecha");
    expect(
      hecha.completada_en,
      "el trigger sella cuándo se cerró: el panel nunca escribe esa columna",
    ).not.toBeNull();

    /*
      Borrar: el primer envío pregunta y NO borra.

      Sin `exact` a propósito, y no es dejadez: «Borrar» y «Sí, borrar la tarea»
      son EL MISMO botón —el mismo formulario, la misma acción— y nunca están
      los dos a la vez, así que dentro de la tarjeta no hay ambigüedad que
      desempatar. Exigir el rótulo entero ataría el test además a las mayúsculas
      con las que se pinta, que son de la hoja de estilos y no del texto.
    */
    await tarjeta(page, creada.id)
      .getByRole("button", { name: copy.panel.tareas.borrar })
      .click();
    await esperarEstado(page, "confirmar-borrado");
    await expect(page.getByText(copy.panel.tareas.avisoConfirmarBorrado)).toBeVisible();

    const siguen = await conBase(
      (sql) => sql<{ id: string }[]>`select id from public.tareas where id = ${creada.id}`,
    );
    expect(siguen.length, "el primer envío no puede borrar nada").toBe(1);

    // Ahora sí, confirmando.
    await tarjeta(page, creada.id)
      .getByRole("button", { name: copy.panel.tareas.confirmarBorrado })
      .click();
    await esperarEstado(page, "borrada");

    const restantes = await conBase(
      (sql) => sql<{ id: string }[]>`select id from public.tareas where id = ${creada.id}`,
    );
    expect(restantes).toEqual([]);
  });

  /**
   * CASO DE ERROR · sin título no se guarda, y se dice por qué.
   *
   * Se le quita el `required` al campo, como haría quien manda el formulario
   * desde fuera del navegador: lo que se prueba es que el SERVIDOR también dice
   * que no. Y se comprueba contra la base que no ha quedado media tarea escrita
   * — de ahí la categoría marcada, que es lo único identificable que se envía.
   */
  test("una tarea sin título no se guarda, y dice por qué", async ({ page }) => {
    const categoria = `${MARCA} sin titulo ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_TAREAS);

    const alta = seccion(page, copy.panel.tareas.nuevaTitulo);
    await alta.getByLabel(copy.panel.tareas.campoCategoria, { exact: true }).fill(categoria);
    await alta
      .locator('input[name="titulo"]')
      .evaluate((campo) => campo.removeAttribute("required"));
    await alta.getByRole("button", { name: copy.panel.tareas.crear }).click();

    await esperarEstado(page, "titulo");
    await expect(page.getByText(copy.panel.tareas.errorTitulo)).toBeVisible();

    const escritas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.tareas where categoria = ${categoria}
      `,
    );
    expect(escritas, "sin título no puede quedar nada escrito").toEqual([]);
  });

  /**
   * BODA-81 · EL TABLERO SE MUEVE CON EL TECLADO, y lo que se mueve es la base.
   *
   * El escenario se monta por SQL: lo que se prueba es el tablero, no volver a
   * recorrer el alta que ya cubre el test de arriba.
   */
  test("en el tablero, una tarjeta cambia de columna sólo con el teclado", async ({ page }) => {
    const titulo = `${MARCA} Mover con el teclado ${Date.now()}`;
    const tablero = `${RUTA_TAREAS}?vista=tablero`;

    const id = await conBase(async (sql) => {
      const [fila] = await sql<{ id: string }[]>`
        insert into public.tareas (titulo, estado) values (${titulo}, 'pendiente')
        returning id
      `;
      return fila.id;
    });

    await entrar(page);
    await page.goto(tablero);

    const mover = tarjeta(page, id).getByRole("button", {
      name: rotuloMoverA(copy.panel.tareas.estados.en_progreso),
    });

    /*
      SIN UN SOLO CLIC: se lleva el foco al botón y se pulsa Enter. Si el
      «botón» fuese un `div` con un manejador de ratón, `focus()` no lo
      alcanzaría y la tecla no haría nada — que es justo lo que este test
      existe para impedir.
    */
    await mover.focus();
    await expect(mover).toBeFocused();
    await page.keyboard.press("Enter");

    await esperarEstado(page, "estado-cambiado", tablero);

    const [movida] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select estado from public.tareas where id = ${id}
      `,
    );
    expect(movida.estado, "el cambio de columna se guarda en la base").toBe("en_progreso");

    // Y sobrevive a la recarga, en la columna que toca y no en otra.
    await page.goto(tablero);
    await expect(
      seccion(page, copy.panel.tareas.estados.en_progreso).locator(`#tarea-${id}`),
    ).toHaveCount(1);
    await expect(
      seccion(page, copy.panel.tareas.estados.pendiente).locator(`#tarea-${id}`),
    ).toHaveCount(0);
  });

  /**
   * BODA-81 · EL ORDEN DENTRO DE LA COLUMNA SE GUARDA.
   *
   * QUIÉN ADELANTA A QUIÉN LO DECIDE EL ORDEN QUE HAY, no el de inserción. La
   * columna tiene más tareas —las de la plantilla, las de otras pasadas— y dar
   * por hecho quién es el vecino convierte un orden inesperado en un fallo que
   * no dice nada. Se lee la lista tal y como se está pintando, se coge el vecino
   * de verdad, y se afirma la permuta contra él y contra la base.
   */
  test("subir una tarjeta cambia su sitio en la columna, y se guarda", async ({ page }) => {
    const sello = Date.now();
    const tablero = `${RUTA_TAREAS}?vista=tablero`;

    /*
      Dos, y las dos con la prioridad más baja y sin fecha: así caen al final de
      la columna —el orden es `orden, prioridad desc, fecha_limite`— y la
      segunda tiene garantizado un vecino por delante al que adelantar.
    */
    const mia = await conBase(async (sql) => {
      const [primera] = await sql<{ id: string }[]>`
        insert into public.tareas (titulo, estado, prioridad)
        values (${`${MARCA} Penúltima ${sello}`}, 'pendiente', 'baja')
        returning id
      `;
      const [segunda] = await sql<{ id: string }[]>`
        insert into public.tareas (titulo, estado, prioridad)
        values (${`${MARCA} Última ${sello}`}, 'pendiente', 'baja')
        returning id
      `;
      return { primera: primera.id, segunda: segunda.id };
    });

    await entrar(page);
    await page.goto(tablero);

    const antes = await ordenDeLaColumna(page, copy.panel.tareas.estados.pendiente);
    const puesto = antes.indexOf(mia.segunda);
    expect(
      puesto,
      `la tarea tenía que estar en la columna con alguien delante. Orden leído:\n${antes.join("\n")}`,
    ).toBeGreaterThan(0);

    const vecino = antes[puesto - 1];

    await tarjeta(page, mia.segunda)
      .getByRole("button", { name: copy.panel.tareas.subirOrden })
      .click();
    await esperarEstado(page, "movida", tablero);

    const despues = await ordenDeLaColumna(page, copy.panel.tareas.estados.pendiente);
    expect(
      despues.indexOf(mia.segunda),
      `tenía que haber adelantado a su vecino. Orden resultante:\n${despues.join("\n")}`,
    ).toBeLessThan(despues.indexOf(vecino));

    // Y no es cosa de la pantalla: la posición está escrita en la base.
    const posiciones = await conBase(
      (sql) => sql<{ id: string; orden: number | null }[]>`
        select id, orden from public.tareas where id in (${mia.segunda}, ${vecino})
      `,
    );
    const suya = posiciones.find((fila) => fila.id === mia.segunda);
    const delVecino = posiciones.find((fila) => fila.id === vecino);

    expect(suya?.orden, "moverse escribe la posición, no la deja en blanco").not.toBeNull();
    expect(delVecino?.orden).not.toBeNull();
    expect(suya!.orden!).toBeLessThan(delVecino!.orden!);
  });

  /**
   * BODA-82 · GENERAR DOS VECES NO DUPLICA NADA.
   *
   * La garantía es de la base —`plantilla_id` con su índice único— y por eso se
   * afirma allí: cada fila de la plantilla del grupo elegido tiene UNA tarea, ni
   * cero ni dos. El aviso de «0 creadas» se comprueba también, porque un
   * silencio se lee como que la segunda vez no funcionó.
   */
  test("generar la plantilla dos veces no duplica ninguna tarea", async ({ page }) => {
    // El grupo sale de la BASE, como los que pinta la pantalla: una constante
    // aquí probaría un grupo que quizá ya no existe.
    const [primero] = await conBase(
      (sql) => sql<{ grupo: string }[]>`
        select distinct grupo from public.plantilla_tareas order by grupo limit 1
      `,
    );
    expect(primero?.grupo, "la plantilla tiene que traer algún grupo sembrado").toBeTruthy();

    await entrar(page);
    await page.goto(RUTA_TAREAS);

    const plantilla = seccion(page, copy.panel.tareas.plantillaTitulo);
    const casilla = plantilla.locator(`input[name="grupos"][value="${primero.grupo}"]`);
    await casilla.check();
    await plantilla.getByRole("button", { name: copy.panel.tareas.generar }).click();

    // La primera vez puede crear o encontrárselas ya puestas: las dos son
    // respuestas correctas y ninguna de las dos es lo que se está probando.
    await esperarAlgunEstado(page, ["generadas", "ya-estaban"]);

    /*
      SE VUELVE A LA PANTALLA LIMPIA ANTES DE LA SEGUNDA, Y ESO EVITA UN FALSO
      VERDE. La espera se conforma con la URL cuando el destino de la acción no
      ha llegado todavía; si la primera generación acabó ya en `ya-estaban`, esa
      misma URL daría por buena la segunda antes de que se enviara nada.
      Partiendo de `/panel/tareas` a secas, sólo puede satisfacerla la respuesta
      de la segunda acción.
    */
    await page.goto(RUTA_TAREAS);

    // La segunda es la que importa, y ésa sí es exacta.
    const otraVez = seccion(page, copy.panel.tareas.plantillaTitulo);
    await otraVez.locator(`input[name="grupos"][value="${primero.grupo}"]`).check();
    await otraVez.getByRole("button", { name: copy.panel.tareas.generar }).click();

    await esperarEstado(page, "ya-estaban");
    await expect(page.getByText(copy.panel.tareas.avisoYaEstaban)).toBeVisible();

    const repetidas = await conBase(
      (sql) => sql<{ id: string; cuantas: number }[]>`
        select p.id, count(t.id)::int as cuantas
          from public.plantilla_tareas as p
          left join public.tareas as t on t.plantilla_id = p.id
         where p.grupo = ${primero.grupo}
         group by p.id
        having count(t.id) <> 1
      `,
    );
    expect(repetidas, "cada fila de la plantilla tiene UNA tarea: ni cero ni dos").toEqual([]);
  });
});
