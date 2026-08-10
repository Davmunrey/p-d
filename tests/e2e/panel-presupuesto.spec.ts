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

/*
  NO VAN EN SERIE, Y ES UN ARREGLO, NO UNA RELAJACIÓN.

  Cada test se fabrica sus propios datos por SQL —su proveedor, su categoría—
  así que no dependen unos de otros. Ponerlos en serie sólo tenía un efecto, y
  era malo: cuando uno se pasaba de plazo, Playwright **saltaba los siguientes**
  («3 did not run») y reintentaba el bloque ENTERO, multiplicando el trabajo del
  runner justo cuando iba justo de tiempo. Así, un solo viaje lento tumbaba el
  trabajo y escondía si los demás pasaban.

  Sin serie, un fallo es un fallo de un test, el reintento vuelve a ejecutar ese
  y nada más, y el registro dice la verdad sobre los otros.
*/

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
    Se espera a la URL y no al aviso: la URL dice si la acción terminó y con
    qué resultado, y el aviso llega después. Meterlo todo en el mismo plazo
    hacía que el fallo apareciera en un punto distinto en cada intento.
  */
  /*
    `toHaveURL` y no `waitForURL`, por lo que dicen al fallar.

    Los dos esperan lo mismo, pero `waitForURL` sólo sabe decir «se acabó el
    tiempo»: no cuenta dónde te has quedado. Y aquí la pregunta entera es a
    dónde fue la redirección — si acabó en `sin-permiso` o en `error`, eso NO es
    lentitud, es la acción diciendo que no ha podido, y el test tiene que
    enseñarlo en vez de mandar a mirar plazos. `toHaveURL` imprime la URL
    recibida y con eso el fallo se lee solo.
  */
  try {
    await expect(pagina).toHaveURL(new RegExp(`estado=${esperado}(&|$)`), {
      timeout: 30_000,
    });
  } catch (fallo) {
    /*
      SI NO REDIRIGE, LO SIGUIENTE QUE HAY QUE SABER ES QUÉ SE VE.
      Una acción que lanza no cambia la URL: Next pinta el `error.tsx` del
      panel en el sitio y la dirección se queda como estaba. Visto sólo desde
      la URL, eso es indistinguible de «no ha pasado nada» — y son dos cosas
      muy distintas. Se adjunta lo que la pantalla está diciendo para que el
      registro de CI lo distinga sin tener que abrir la traza.
    */
    const enPantalla = await pagina
      .locator("main")
      .innerText()
      .catch(() => "(no se pudo leer la pantalla)");
    throw new Error(
      `${(fallo as Error).message}\n\nLa pantalla decía:\n${enPantalla.slice(0, 600)}`,
    );
  }
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

/**
 * BODA-64 · El aviso de desvío, en la portada del panel
 *
 * LO QUE SE PRUEBA AQUÍ ES QUE EL AVISO LLEGA A LA PORTADA. Los bordes de la
 * decisión —justo en el umbral, sin presupuesto, el orden— los cubre
 * `tests/unidad/desvios.test.ts`, que no necesita navegador. Lo que un test
 * unitario no puede decir es si esto se ve al entrar, que es el criterio entero
 * del ticket: quien se ha pasado con el catering no entra al módulo de
 * presupuesto a comprobarlo, entra a mirar cuántos han confirmado.
 *
 * TODO EN SERIE: los dos tests mueven el mismo gasto arriba y abajo del umbral.
 */
test.describe.configure({ mode: "serial" });

test.describe("El aviso de desvío en la portada", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  const NOMBRE = `${MARCA} Desvio`;

  /** Una categoría de 1.000 € con un gasto que se pueda mover a voluntad. */
  async function montar(): Promise<string> {
    return conBase(async (sql) => {
      const como = `${NOMBRE}%`;
      await sql`
        delete from public.pagos where partida_id in (
          select p.id from public.partidas_presupuesto as p
           join public.categorias_presupuesto as c on c.id = p.categoria_id
          where c.nombre like ${como}
        )
      `;
      await sql`
        delete from public.partidas_presupuesto where categoria_id in (
          select id from public.categorias_presupuesto where nombre like ${como}
        )
      `;
      await sql`delete from public.categorias_presupuesto where nombre like ${como}`;

      const [categoria] = await sql<{ id: string }[]>`
        insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
        values (${`${NOMBRE} ${Date.now()}`}, 1000, 91) returning id
      `;
      const [gasto] = await sql<{ id: string }[]>`
        insert into public.partidas_presupuesto (categoria_id, concepto, importe_estimado)
        values (${categoria.id}, ${`${NOMBRE} · gasto`}, 100) returning id
      `;
      return gasto.id;
    });
  }

  async function fijarGasto(gastoId: string, importe: number): Promise<void> {
    await conBase(
      (sql) => sql`
        update public.partidas_presupuesto
           set importe_estimado = ${importe}, importe_real = null
         where id = ${gastoId}
      `,
    );
  }

  const aviso = (pagina: Page) =>
    pagina.locator("section").filter({
      has: pagina.getByRole("heading", { name: copy.panel.resumen.desvios.titulo }),
    });

  /**
   * CAMINO FELIZ · pasarse de lo previsto saca el aviso en la portada.
   */
  test("superar lo previsto de una categoría avisa en la portada", async ({ page }) => {
    const gastoId = await montar();

    await entrar(page);

    // De partida, 100 de 1.000: ni de lejos. La categoría no sale.
    await page.goto(RUTA_PANEL);
    await expect(aviso(page).getByText(NOMBRE, { exact: false })).toHaveCount(0);

    // Se dispara el gasto por encima de lo previsto.
    await fijarGasto(gastoId, 1200);
    await page.goto(RUTA_PANEL);

    const bloque = aviso(page);
    await expect(bloque, "el aviso tiene que salir en la portada").toBeVisible();

    /*
      Y LO DICE CON PALABRAS, no sólo con el color: se busca el texto de
      «se ha pasado», que es lo único que lee quien no distingue el rojo.
    */
    const linea = bloque.locator("li").filter({ hasText: NOMBRE });
    await expect(linea).toContainText(copy.panel.resumen.desvios.superado);
  });

  /**
   * CASO DE ERROR · bajar el gasto por debajo del umbral retira el aviso.
   *
   * Un aviso que sale bien pero no se va nunca es peor que no tenerlo: enseña a
   * ignorarlo, y con él se ignora el siguiente.
   */
  test("bajar el gasto por debajo del umbral retira el aviso", async ({ page }) => {
    const gastoId = await montar();
    await fijarGasto(gastoId, 1200);

    await entrar(page);
    await page.goto(RUTA_PANEL);
    await expect(aviso(page).locator("li").filter({ hasText: NOMBRE })).toBeVisible();

    // Se corrige el gasto a algo cómodo: 300 de 1.000 no roza el umbral.
    await fijarGasto(gastoId, 300);
    await page.goto(RUTA_PANEL);

    await expect(
      aviso(page).locator("li").filter({ hasText: NOMBRE }),
      "corregido el gasto, el aviso tiene que irse",
    ).toHaveCount(0);
  });
});
