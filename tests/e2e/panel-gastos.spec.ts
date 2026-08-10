import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_GASTOS, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-61 · Partidas de gasto
 *
 * LO QUE HAY QUE PROBAR AQUÍ ES QUE LOS TOTALES SON DE VERDAD. Una pantalla de
 * presupuesto que enseña una cifra que no sale de sumar los gastos no está
 * «casi bien»: está mintiendo sobre la única pregunta que se le hace. Así que
 * el camino feliz no termina en «el gasto aparece en la lista», termina en que
 * el total de su categoría y el general han subido exactamente lo que costaba.
 *
 * Y SE COMPRUEBA CONTRA LA BASE, no contra el HTML. Con RLS de por medio una
 * escritura prohibida no da error: devuelve cero filas. Un panel que dice
 * «apuntado» sin escribir pasaría cualquier test que sólo mire la pantalla.
 *
 * LOS DOS CASOS DE ERROR SON LOS DEL DINERO. Un importe con tres decimales y
 * uno negativo: antes se redondeaban y se aceptaban en silencio, que es como un
 * dedo que resbala acaba dentro del presupuesto sin que nadie se entere.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Gastos";

const gastos = copy.panel.presupuesto.gastos;

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

/** Las secciones se localizan por su título, nunca por su posición. */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/**
 * ESPERA LA REDIRECCIÓN ANTES DE MIRAR NADA MÁS.
 *
 * La URL dice si la acción terminó y con qué resultado; el aviso llega después.
 * Y `toHaveURL` en vez de `waitForURL` porque imprime la URL recibida: si la
 * redirección acabó en `sin-permiso`, eso no es lentitud, es la acción diciendo
 * que no ha podido, y el registro de CI tiene que distinguirlo.
 */
async function esperarEstado(pagina: Page, esperado: string) {
  try {
    await expect(pagina).toHaveURL(new RegExp(`estado=${esperado}(&|$)`), {
      timeout: 30_000,
    });
  } catch (fallo) {
    const enPantalla = await pagina
      .locator("main")
      .innerText()
      .catch(() => "(no se pudo leer la pantalla)");
    throw new Error(
      `${(fallo as Error).message}\n\nLa pantalla decía:\n${enPantalla.slice(0, 600)}`,
    );
  }
}

/**
 * «1.234,50 €» → 1234.5
 *
 * El test lee la cifra de la pantalla y no de la base a propósito: lo que hay
 * que comprobar es que lo que se ENSEÑA cuadra. Deshacer el formato castellano
 * —punto de millar fuera, coma decimal a punto— es justo lo contrario de lo que
 * hace `Intl.NumberFormat`, y el espacio antes del símbolo es fino y no cae con
 * un `trim()` normal.
 */
function comoNumero(texto: string): number {
  const limpio = texto
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(limpio);
}

/** El total general que enseña la cabecera, ya en número. */
async function totalQueVaCostando(pagina: Page): Promise<number> {
  const bloque = seccion(pagina, gastos.totalTitulo)
    .locator("div")
    .filter({ hasText: gastos.totalReal });
  return comoNumero(await bloque.locator("dd").innerText());
}

/**
 * Una categoría recién hecha, vacía, con su previsión.
 *
 * SE LIMPIA LO QUE DEJÓ LA EJECUCIÓN ANTERIOR, y sólo lo de ESTE test: el
 * barrido va por el prefijo propio (`… Feliz`, `… Negativo`) y no por la marca
 * entera. Con `fullyParallel` los cinco tests corren a la vez fuera de CI, y un
 * `delete like '(DES) E2E Gastos%'` borraría los datos que otro acaba de crear
 * — un fallo que además sólo aparecería en local, donde hay varios `workers`.
 *
 * Y EN EL ORDEN QUE IMPONE LA BASE: primero los pagos, después los gastos y sólo
 * entonces la categoría. `pagos.partida_id` y `partidas_presupuesto.categoria_id`
 * son las dos `on delete restrict`, así que al revés falla — y un test que sólo
 * pasa con la base recién hecha no se puede repetir.
 */
async function crearCategoria(sufijo: string): Promise<{ id: string; nombre: string }> {
  const prefijo = `${MARCA} ${sufijo}`;
  const nombre = `${prefijo} ${Date.now()}`;
  const id = await conBase(async (sql) => {
    const como = `${prefijo}%`;
    await sql`
      delete from public.pagos
       where partida_id in (
         select p.id
           from public.partidas_presupuesto as p
           join public.categorias_presupuesto as c on c.id = p.categoria_id
          where c.nombre like ${como}
       )
    `;
    await sql`
      delete from public.partidas_presupuesto
       where categoria_id in (
         select id from public.categorias_presupuesto where nombre like ${como}
       )
    `;
    await sql`delete from public.categorias_presupuesto where nombre like ${como}`;

    const [categoria] = await sql<{ id: string }[]>`
      insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
      values (${nombre}, 5000, 90)
      returning id
    `;
    return categoria.id;
  });
  return { id, nombre };
}

/**
 * La fila de un gasto concreto, por su concepto.
 *
 * `hasText` y no el `value` de un campo: la lista enseña filas, no formularios
 * —el formulario sólo se abre para el gasto que se va a tocar—, así que el
 * concepto está en el texto y no en un `input`.
 */
function filaDe(pagina: Page, concepto: string) {
  return pagina.locator("li").filter({ hasText: concepto });
}

/**
 * Abre la edición de un gasto y devuelve su fila, ya con el formulario dentro.
 *
 * La edición vive en la URL (`?editar=`), así que esperar a que el campo esté
 * es esperar a que la navegación haya terminado: sin eso, el `fill` siguiente
 * correría contra la fila todavía cerrada.
 */
async function abrirEdicion(pagina: Page, concepto: string) {
  const fila = filaDe(pagina, concepto);
  await fila.getByRole("link", { name: gastos.editar }).click();
  await expect(
    filaDe(pagina, concepto).getByLabel(gastos.campoAcordado, { exact: true }),
  ).toBeVisible();
  return filaDe(pagina, concepto);
}

test.describe("Los gastos del presupuesto", () => {
  /*
    CADA PASO ES UN VIAJE COMPLETO: escribir en la base, redirigir y repintar
    entera una página `force-dynamic` con sus consultas. En el trabajo de CI que
    levanta Supabase en Docker eso no cabe en el plazo por defecto.
  */
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /**
   * CAMINO FELIZ · apuntar un gasto mueve el total de su categoría y el general.
   */
  test("apuntar un gasto cambia el total de su categoría y el general", async ({ page }) => {
    const categoria = await crearCategoria("Feliz");
    const concepto = `${MARCA} Ramo de novia`;

    await entrar(page);
    await page.goto(RUTA_GASTOS);

    // La foto de antes. Es lo que tiene que haber cambiado al terminar.
    const antes = await totalQueVaCostando(page);

    const alta = seccion(page, gastos.nuevaTitulo);
    await alta.getByLabel(gastos.campoConcepto, { exact: true }).fill(concepto);
    await alta
      .getByLabel(gastos.campoCategoria, { exact: true })
      .selectOption({ label: categoria.nombre });
    // Con separador de millar y coma decimal, como se escribe en castellano.
    await alta.getByLabel(gastos.campoEstimado, { exact: true }).fill("1.234,50");
    await alta.getByRole("button", { name: gastos.crear }).click();

    await esperarEstado(page, "gasto-creado");
    await expect(page.getByText(gastos.avisoCreado)).toBeVisible();

    // 1 · Está escrito, con su categoría y su importe exacto.
    const [guardado] = await conBase(
      (sql) => sql<{ categoria_id: string; importe_estimado: string }[]>`
        select categoria_id, importe_estimado
          from public.partidas_presupuesto where concepto = ${concepto}
      `,
    );
    expect(guardado, "el gasto tiene que quedar guardado").toBeDefined();
    expect(guardado.categoria_id).toBe(categoria.id);
    expect(Number(guardado.importe_estimado)).toBe(1234.5);

    // 2 · El total general ha subido exactamente lo que costaba. Es la
    //     comprobación que da sentido a la pantalla: lo suma la base.
    expect(
      await totalQueVaCostando(page),
      "el total general tiene que subir lo que cuesta el gasto",
    ).toBeCloseTo(antes + 1234.5, 2);

    // 3 · Y el de su categoría, que empezaba vacía, es justo ese importe.
    const suya = seccion(page, categoria.nombre);
    await expect(suya.getByText(gastos.subtotal)).toContainText("1234,50");
  });

  /**
   * CASO DE ERROR · Un importe con tres decimales no se redondea en silencio.
   */
  test("un importe con más de dos decimales se rechaza y se dice", async ({ page }) => {
    const categoria = await crearCategoria("Decimales");
    const concepto = `${MARCA} Tres decimales`;

    await entrar(page);
    await page.goto(RUTA_GASTOS);

    const alta = seccion(page, gastos.nuevaTitulo);
    await alta.getByLabel(gastos.campoConcepto, { exact: true }).fill(concepto);
    await alta
      .getByLabel(gastos.campoCategoria, { exact: true })
      .selectOption({ label: categoria.nombre });
    await alta.getByLabel(gastos.campoEstimado, { exact: true }).fill("8600,555");
    await alta.getByRole("button", { name: gastos.crear }).click();

    await esperarEstado(page, "importe");
    await expect(page.getByText(gastos.errorImporte)).toBeVisible();

    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.partidas_presupuesto where concepto = ${concepto}
      `,
    );
    expect(filas, "un céntimo de más no puede crear el gasto a medias").toHaveLength(0);
  });

  /**
   * CASO DE ERROR · Un importe negativo tampoco. Un gasto no devuelve dinero.
   */
  test("un importe negativo se rechaza y no escribe nada", async ({ page }) => {
    const categoria = await crearCategoria("Negativo");
    const concepto = `${MARCA} En negativo`;

    await entrar(page);
    await page.goto(RUTA_GASTOS);

    const alta = seccion(page, gastos.nuevaTitulo);
    await alta.getByLabel(gastos.campoConcepto, { exact: true }).fill(concepto);
    await alta
      .getByLabel(gastos.campoCategoria, { exact: true })
      .selectOption({ label: categoria.nombre });
    await alta.getByLabel(gastos.campoEstimado, { exact: true }).fill("-300");
    await alta.getByRole("button", { name: gastos.crear }).click();

    await esperarEstado(page, "importe");

    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.partidas_presupuesto where concepto = ${concepto}
      `,
    );
    expect(filas, "un importe negativo no puede llegar a la base").toHaveLength(0);
  });

  /**
   * LO ACORDADO NO ES LO ESTIMADO, Y VACÍO NO ES CERO.
   *
   * Es la distinción entera del ticket: mientras no hay acuerdo, la columna
   * tiene que quedarse en `null`. Un cero ahí sería un proveedor que sale
   * gratis, y ese ahorro inventado entraría en la desviación de la categoría.
   */
  test("lo acordado se queda sin poner mientras no se cierra", async ({ page }) => {
    const categoria = await crearCategoria("Acordado");
    const concepto = `${MARCA} Sin cerrar todavía`;

    await entrar(page);
    await page.goto(RUTA_GASTOS);

    const alta = seccion(page, gastos.nuevaTitulo);
    await alta.getByLabel(gastos.campoConcepto, { exact: true }).fill(concepto);
    await alta
      .getByLabel(gastos.campoCategoria, { exact: true })
      .selectOption({ label: categoria.nombre });
    await alta.getByLabel(gastos.campoEstimado, { exact: true }).fill("400");
    await alta.getByRole("button", { name: gastos.crear }).click();
    await esperarEstado(page, "gasto-creado");

    const [reciente] = await conBase(
      (sql) => sql<{ importe_real: string | null }[]>`
        select importe_real from public.partidas_presupuesto where concepto = ${concepto}
      `,
    );
    expect(reciente.importe_real, "sin acuerdo, lo acordado se queda nulo").toBeNull();

    // Y al cerrarlo, se guarda: es el mismo campo, ahora con valor.
    const abierto = await abrirEdicion(page, concepto);
    await abierto.getByLabel(gastos.campoAcordado, { exact: true }).fill("380,25");
    await abierto.getByRole("button", { name: gastos.guardar }).click();
    await esperarEstado(page, "gasto-editado");

    const [cerrado] = await conBase(
      (sql) => sql<{ importe_real: string | null }[]>`
        select importe_real from public.partidas_presupuesto where concepto = ${concepto}
      `,
    );
    expect(Number(cerrado.importe_real)).toBe(380.25);
  });

  /**
   * CASO DE ERROR · Un gasto con pagos no se borra de un clic.
   *
   * `pagos.partida_id` es `on delete restrict` y hace bien: lo que ya se pagó es
   * contabilidad, no un apunte que se arrastra al borrar la línea de la que
   * colgaba. Lo que se comprueba es que eso llega a la pantalla como una frase y
   * no como un error genérico.
   */
  test("un gasto con pagos apuntados no se puede borrar", async ({ page }) => {
    const categoria = await crearCategoria("ConPagos");
    const concepto = `${MARCA} Con una señal dada`;

    const partidaId = await conBase(async (sql) => {
      const [partida] = await sql<{ id: string }[]>`
        insert into public.partidas_presupuesto (categoria_id, concepto, importe_estimado)
        values (${categoria.id}, ${concepto}, 2000)
        returning id
      `;
      await sql`
        insert into public.pagos (partida_id, importe, fecha_vencimiento)
        values (${partida.id}, 500, current_date)
      `;
      return partida.id;
    });

    await entrar(page);
    await page.goto(RUTA_GASTOS);

    await filaDe(page, concepto).getByRole("button", { name: gastos.borrar }).click();

    await esperarEstado(page, "tiene-pagos");
    await expect(page.getByText(gastos.errorTienePagos)).toBeVisible();

    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.partidas_presupuesto where id = ${partidaId}
      `,
    );
    expect(filas, "el gasto sigue estando: sus pagos lo sostienen").toHaveLength(1);
  });
});
