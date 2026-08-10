import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL, RUTA_PRESUPUESTO } from "../../src/config/constants";

/**
 * BODA-60 · Categorías de presupuesto
 *
 * EL CASO DE ERROR ES EL QUE JUSTIFICA MEDIA PANTALLA: borrar una categoría
 * que tiene gastos dentro. La base se niega —`on delete restrict`— y hace bien:
 * arrastrar los gastos falsearía el presupuesto y dejarlos sueltos no es
 * posible, porque `categoria_id` es `not null`. Así que la pregunta no es
 * «¿seguro?», es **a dónde van**, y eso es lo que se comprueba: que el primer
 * envío no borra nada, que el segundo mueve los gastos, y que el importe
 * sobrevive con su categoría nueva.
 *
 * SE COMPRUEBA CONTRA LA BASE. Con RLS de por medio, una escritura prohibida no
 * da error: devuelve cero filas. Un panel que dice «guardado» sin escribir
 * pasaría cualquier test que sólo mire el HTML.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Presupuesto";

test.describe.configure({ mode: "serial" });

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
 * ESPERA LA REDIRECCIÓN ANTES DE MIRAR EL AVISO.
 *
 * Cada formulario de esta pantalla hace `POST` a una acción que escribe y
 * **redirige** con el resultado en la URL. Mirar el aviso directamente mete
 * tres cosas en el mismo plazo de cinco segundos —la escritura, la redirección
 * y el renderizado entero de la página siguiente— y en el trabajo de CI que
 * levanta Supabase entero eso se pasa de largo. Pasó en el módulo de
 * proveedores, y el síntoma era el peor posible: el fallo aparecía en un punto
 * distinto en cada reintento, que es como se pierde media tarde buscando un
 * bug de lógica que no existe.
 */
async function esperarEstado(pagina: Page, esperado: string) {
  /*
    `commit` y no `load`: lo que hay que saber es que la redirección ocurrió y
    a qué estado, no que hayan terminado de bajar todas las subpeticiones de la
    página siguiente. Esperar a `load` ataba el test a cosas que no tienen nada
    que ver con lo que comprueba —una fuente, una imagen— y convertía un fallo
    de red ajeno en un «la acción no redirigió» que manda a buscar donde no es.
    Lo que venga después ya espera por su cuenta a lo que necesita ver.
  */
  await pagina.waitForURL(new RegExp(`estado=${esperado}(&|$)`), {
    waitUntil: "commit",
    timeout: 30_000,
  });
}

test.describe("Las categorías del presupuesto", () => {
  /*
    CADA PASO DE ESTAS PANTALLAS ES UN VIAJE COMPLETO: escribir en la base,
    redirigir, y repintar entera una página `force-dynamic` con sus consultas.
    En el trabajo de CI que levanta Supabase en Docker eso no cabe en el plazo
    por defecto, y el síntoma no es un fallo honesto sino uno que aparece en un
    punto distinto en cada intento. `test.slow()` es lo que Playwright ofrece
    para decir «esto es lento de verdad» en vez de ir subiendo plazos sueltos.
  */
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /**
   * CAMINO FELIZ · se crea con su previsión y sale en el resumen.
   */
  test("se crea una categoría con su previsión y aparece en el resumen", async ({ page }) => {
    const nombre = `${MARCA} Flores ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_PRESUPUESTO);

    const alta = seccion(page, copy.panel.presupuesto.nuevaTitulo);
    await alta.getByLabel(copy.panel.presupuesto.campoNombre, { exact: true }).fill(nombre);
    // Con separador de millar y coma decimal, como se escribe en castellano.
    await alta
      .getByLabel(copy.panel.presupuesto.campoPrevisto, { exact: true })
      .fill("1.250,50");
    await alta.getByRole("button", { name: copy.panel.presupuesto.crear }).click();
    await esperarEstado(page, "categoria-creada");

    await expect(page.getByText(copy.panel.presupuesto.avisoCreada)).toBeVisible();

    /*
      EN EL RESUMEN, CON SU IMPORTE YA FORMATEADO — Y SIN PUNTO DE MILLAR.

      Aquí me equivoqué yo y lo dijo el CI: escribí «1.250,50» dando por hecho
      que el punto va siempre. En castellano no: `Intl.NumberFormat` con
      `es-ES` no agrupa los números de cuatro cifras, así que 1250,50 € se
      escribe tal cual y el punto sólo aparece a partir de cinco. La página
      estaba bien y el test estaba mal.
    */
    const fila = page.locator("tr").filter({ hasText: nombre });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText("1250,50");

    // Y guardado como número, no como el texto que se tecleó.
    const [guardada] = await conBase(
      (sql) => sql<{ id: string; importe_previsto: string }[]>`
        select id, importe_previsto from public.categorias_presupuesto where nombre = ${nombre}
      `,
    );
    expect(Number(guardada.importe_previsto)).toBe(1250.5);
  });

  /**
   * CASO DE ERROR · Un importe que no es un número no se guarda en silencio.
   */
  test("un importe que no se entiende se rechaza y se dice", async ({ page }) => {
    const nombre = `${MARCA} Mal importe ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_PRESUPUESTO);

    const alta = seccion(page, copy.panel.presupuesto.nuevaTitulo);
    await alta.getByLabel(copy.panel.presupuesto.campoNombre, { exact: true }).fill(nombre);
    await alta
      .getByLabel(copy.panel.presupuesto.campoPrevisto, { exact: true })
      .fill("lo que haga falta");
    await alta.getByRole("button", { name: copy.panel.presupuesto.crear }).click();
    await esperarEstado(page, "importe");

    await expect(page.getByText(copy.panel.presupuesto.errorImporte)).toBeVisible();

    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.categorias_presupuesto where nombre = ${nombre}
      `,
    );
    expect(filas, "un importe ilegible no puede crear la categoría a medias").toHaveLength(0);
  });

  /**
   * CASO DE ERROR · Borrar una categoría con gastos pregunta a dónde van.
   */
  test("una categoría con gastos no se borra sin decidir qué pasa con ellos", async ({
    page,
  }) => {
    const sello = Date.now();
    const conGastos = `${MARCA} Con gastos ${sello}`;
    const destino = `${MARCA} Destino ${sello}`;

    const { origenId, destinoId, partidaId } = await conBase(async (sql) => {
      const [origen] = await sql<{ id: string }[]>`
        insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
        values (${conGastos}, 3000, 90)
        returning id
      `;
      const [aDonde] = await sql<{ id: string }[]>`
        insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
        values (${destino}, 0, 91)
        returning id
      `;
      const [partida] = await sql<{ id: string }[]>`
        insert into public.partidas_presupuesto (categoria_id, concepto, importe_estimado)
        values (${origen.id}, ${`${MARCA} Ramo`}, 450)
        returning id
      `;
      return { origenId: origen.id, destinoId: aDonde.id, partidaId: partida.id };
    });

    await entrar(page);
    await page.goto(RUTA_PRESUPUESTO);

    /*
      SE LOCALIZA POR EL VALOR DEL CAMPO, NO POR TEXTO.

      Aquí me equivoqué y costó un rato: en la lista de ajuste, el nombre de la
      categoría no es texto de la página, es el `value` de un input — la fila
      ES el formulario. `hasText` mira el contenido de texto y el valor de un
      campo no lo es, así que el `<li>` no casaba nunca y el test se quedaba
      noventa segundos esperando un botón que sí estaba ahí.
    */
    const suya = page
      .locator("li")
      .filter({ has: page.locator(`input[value="${conGastos}"]`) });
    await suya.getByRole("button", { name: copy.panel.presupuesto.borrar }).click();
    await esperarEstado(page, "decidir-gastos");

    // No ha borrado: pregunta a dónde van los gastos.
    await expect(page.getByText(copy.panel.presupuesto.avisoDecidirGastos)).toBeVisible();

    const [sigue] = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.categorias_presupuesto where id = ${origenId}
      `,
    );
    expect(sigue?.id, "el primer envío no puede borrar nada").toBe(origenId);

    // Se elige destino y ahora sí.
    const decision = seccion(page, copy.panel.presupuesto.decidirTitulo);
    await decision
      .getByLabel(copy.panel.presupuesto.campoDestino, { exact: true })
      .selectOption({ label: destino });
    await decision.getByRole("button", { name: copy.panel.presupuesto.moverYBorrar }).click();
    await esperarEstado(page, "gastos-movidos");

    await expect(page.getByText(copy.panel.presupuesto.avisoGastosMovidos)).toBeVisible();

    const restantes = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.categorias_presupuesto where id = ${origenId}
      `,
    );
    expect(restantes).toHaveLength(0);

    // Y lo que de verdad importa: el gasto sigue, con su categoría nueva.
    const [gasto] = await conBase(
      (sql) => sql<{ categoria_id: string; importe_estimado: string }[]>`
        select categoria_id, importe_estimado
          from public.partidas_presupuesto where id = ${partidaId}
      `,
    );
    expect(gasto, "el gasto ocurrió y tiene que seguir contando").toBeDefined();
    expect(gasto.categoria_id).toBe(destinoId);
    expect(Number(gasto.importe_estimado)).toBe(450);
  });
});
