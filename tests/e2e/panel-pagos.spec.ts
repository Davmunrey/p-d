import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PAGOS, RUTA_PANEL } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-62 · Pagos y calendario de vencimientos
 *
 * LO QUE SE PRUEBA ES QUE MARCAR UN PAGO MUEVE EL PRESUPUESTO. Una pantalla de
 * pagos que pone «pagado» y no cambia lo pendiente de su categoría no está a
 * medias: está mintiendo sobre la única cifra que se mira antes de una boda. Por
 * eso el camino feliz termina en `v_resumen_presupuesto` y no en el HTML.
 *
 * Y QUE UN PAGO NO SE SALGA DE SU GASTO. Apuntar 700 € contra un catering al que
 * ya se le han apuntado 400 de 1.000 cuadra en esta pantalla y descuadra el
 * presupuesto entero: se descubre el mes que no llega el dinero. El aviso tiene
 * que llegar ANTES de guardar, y decir cuánto queda — «no cabe» a secas obliga a
 * ir al gasto, mirar su importe, sumar sus pagos y restar.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Pagos";

const pagos = copy.panel.presupuesto.pagos;

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
 * Lo que se afirma cuando NINGUNA acción ha redirigido todavía.
 *
 * ANTES SE CAÍA A `pagina.url()`, Y ESO ERA UN VERDE FALSO. Cuando el
 * navegador no aplica la redirección —#126— el ayudante lleva la pestaña a
 * mano al destino, así que la URL se queda con ese `?estado=` puesto. Si el
 * paso siguiente no llegaba a enviar nada, la comprobación miraba esa misma
 * URL, encontraba el estado del paso ANTERIOR y daba el visto bueno: fue así
 * como una foto que nunca se subió pasó por subida.
 *
 * Con un texto que no case nunca, la ausencia de destino es lo que es —la
 * acción no salió— y el fallo lo dice con esas palabras.
 */
const SIN_DESTINO = "(ninguna acción ha redirigido: ¿llegó a enviarse el formulario?)";

/**
 * La fila de un pago, por su `id` y no por su texto: al abrir la edición el
 * concepto pasa a estar dentro de un `<select>` y `hasText` no lo vería. Es la
 * misma lección que dejó el spec de gastos.
 */
function filaDe(pagina: Page, pagoId: string) {
  return pagina.locator(`#pago-${pagoId}`);
}

async function esperarEstado(pagina: Page, esperado: string) {
  /*
    SE AFIRMA EL DESTINO QUE DEVOLVIÓ LA ACCIÓN, no la barra del navegador:
    es lo que #126 rompe de vez en cuando en este trabajo de CI. El rastro
    apunta qué decidió el servidor; si la pestaña no se movió, se la lleva a
    donde la redirección decía, que es lo que habría hecho ella.
  */
  try {
    await expect
      .poll(() => ultimoDestino(pagina) ?? SIN_DESTINO, { timeout: 30_000 })
      .toMatch(new RegExp(`estado=${esperado}(&|$)`));
  } catch (fallo) {
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

  /*
    Y SE VA AL DESTINO SIEMPRE, aunque la barra ya lo lleve puesto.

    Antes se iba sólo «si el navegador no lo siguió», mirando la URL. Y la URL
    miente: un rescate anterior deja esa misma dirección, así que en el paso
    siguiente «ya estoy ahí» significaba «me quedo con la pantalla de hace dos
    pasos» — y el test miraba un render viejo, sin lo que acababa de
    escribirse. Recargar cuesta milisegundos contra un servidor local; mirar
    una pantalla vieja cuesta una ejecución de CI entera.
  */
  if (destino) {
    if (!pagina.url().includes(`estado=${esperado}`)) {
      console.warn(`#126: la pestaña no siguió la redirección a ${destino}.`);
    }
    await pagina.goto(destino);
  }

  await pagina.waitForLoadState("networkidle");
}

interface Montaje {
  categoriaId: string;
  categoria: string;
  gastoId: string;
  concepto: string;
}

/**
 * Una categoría con un gasto de 1.000 €, recién hechos.
 *
 * SE LIMPIA SÓLO LO DE ESTE TEST, por su prefijo propio: con `fullyParallel` los
 * tests corren a la vez fuera de CI y un barrido por la marca entera borraría lo
 * que otro acaba de crear.
 *
 * Y EN EL ORDEN QUE IMPONE LA BASE: pagos, gastos y por último la categoría. Las
 * dos claves ajenas son `on delete restrict`, así que al revés falla.
 */
async function montar(sufijo: string, importe = 1000): Promise<Montaje> {
  const prefijo = `${MARCA} ${sufijo}`;
  const categoria = `${prefijo} ${Date.now()}`;
  const concepto = `${prefijo} · gasto`;

  return conBase(async (sql) => {
    const como = `${prefijo}%`;
    await sql`
      delete from public.pagos
       where partida_id in (
         select p.id from public.partidas_presupuesto as p
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

    const [cat] = await sql<{ id: string }[]>`
      insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
      values (${categoria}, ${importe}, 90) returning id
    `;
    const [gasto] = await sql<{ id: string }[]>`
      insert into public.partidas_presupuesto (categoria_id, concepto, importe_estimado)
      values (${cat.id}, ${concepto}, ${importe}) returning id
    `;

    return { categoriaId: cat.id, categoria, gastoId: gasto.id, concepto };
  });
}

/**
 * Un pago apuntado por SQL: lo que se prueba no es volver a teclear el alta.
 *
 * EL `::int` NO SOBRA, aunque el parámetro ya sea un número en JavaScript. Va
 * como parámetro y Postgres lo recibe con tipo `unknown`, y `date + unknown` es
 * **ambiguo**: encaja con `date + integer` (otra fecha) y con `date + interval`
 * (una marca de tiempo), así que el servidor se niega a elegir —
 * «operator is not unique: date + unknown»—. Escrito a mano en un `psql` no
 * falla, porque ahí el literal ya llega tipado; sólo se rompe por parámetro, que
 * es justo como lo manda este test.
 */
async function apuntar(
  gastoId: string,
  importe: number,
  diasHastaVencer: number,
): Promise<string> {
  const [pago] = await conBase(
    (sql) => sql<{ id: string }[]>`
      insert into public.pagos (partida_id, importe, fecha_vencimiento)
      values (${gastoId}, ${importe}, current_date + ${diasHastaVencer}::int)
      returning id
    `,
  );
  return pago.id;
}

/** Lo que la BASE dice que queda por pagar de una categoría. */
async function pendienteDe(categoriaId: string): Promise<number> {
  const [fila] = await conBase(
    (sql) => sql<{ pendiente: string }[]>`
      select pendiente from public.v_resumen_presupuesto where categoria_id = ${categoriaId}
    `,
  );
  return Number(fila.pendiente);
}

/**
 * LO SEMBRADO SE VA TAMBIÉN AL ACABAR. Cada montaje limpia lo de su sufijo
 * antes de sembrar, pero el último de cada uno se quedaba: en una base que no
 * se tira, la portada del panel acababa avisando de quince categorías de
 * prueba «a punto de pasarse».
 *
 * En el orden que impone la base: pagos, gastos y por último la categoría.
 */
async function limpiar() {
  if (!cadena) return;
  await conBase(async (sql) => {
    const como = `${MARCA}%`;
    await sql`
      delete from public.pagos where partida_id in (
        select p.id from public.partidas_presupuesto as p
        join public.categorias_presupuesto as c on c.id = p.categoria_id
        where c.nombre like ${como})
    `;
    await sql`
      delete from public.partidas_presupuesto where categoria_id in (
        select id from public.categorias_presupuesto where nombre like ${como})
    `;
    await sql`delete from public.categorias_presupuesto where nombre like ${como}`;
  });
}

test.afterAll(limpiar);

test.describe("Los pagos y sus vencimientos", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  // El rastro, en TODOS los tests: sin él `ultimoDestino` no ve nada y la
  // espera se queda sin poder decir qué decidió la acción.
  test.beforeEach(({ page }) => seguirLaPista(page));

  /**
   * CAMINO FELIZ · marcar un pago como hecho reduce lo pendiente del gasto.
   */
  test("marcar un pago como hecho reduce lo que queda por pagar", async ({ page }) => {
    const montaje = await montar("Feliz");
    const señal = await apuntar(montaje.gastoId, 400, 10);
    await apuntar(montaje.gastoId, 600, 40);

    // De partida: los dos pendientes, mil euros por pagar.
    expect(await pendienteDe(montaje.categoriaId), "de partida quedan los 1.000").toBe(1000);

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    /*
      LA FOTO DE PARTIDA, Y NO SÓLO POR DOCUMENTAR.

      Pulsar en seco nada más llegar es como se pierde un envío: los specs que
      nunca fallan rellenan un formulario antes, y ese rato es el que la página
      necesita para quedar viva. Aquí no hay nada que rellenar, así que se
      comprueba lo que debería verse antes de tocar —la fila y su botón— y eso
      hace las dos cosas: deja escrito el estado inicial y espera a que el botón
      sea de verdad pulsable.
    */
    const filaSeñal = filaDe(page, señal);
    await expect(filaSeñal, "la fila del pago tiene que estar antes de marcarla").toBeVisible();
    const marcarSeñal = filaSeñal.getByRole("button", { name: pagos.marcarPagado });
    await expect(marcarSeñal).toBeEnabled();
    await marcarSeñal.click();
    await esperarEstado(page, "marcado-pagado");

    // 1 · La base lo da por pagado, con su fecha y no con un booleano.
    const [guardado] = await conBase(
      (sql) => sql<{ pagado_en: string | null }[]>`
        select pagado_en from public.pagos where id = ${señal}
      `,
    );
    expect(guardado.pagado_en, "marcar pagado escribe la fecha").not.toBeNull();

    // 2 · Y lo pendiente de su categoría baja exactamente esos 400 €. Es la
    //     comprobación que da sentido a la pantalla: lo calcula la vista.
    expect(
      await pendienteDe(montaje.categoriaId),
      "lo pendiente tiene que bajar lo que se acaba de pagar",
    ).toBe(600);

    // 3 · Y se ve, sin recargar a mano.
    await expect(page.getByText(pagos.avisoPagado)).toBeVisible();
  });

  /**
   * CASO DE ERROR · Un pago que no cabe avisa antes de guardarse, y dice cuánto
   * queda: «no cabe» a secas obliga a ir al gasto a echar la cuenta.
   */
  test("un pago mayor que lo que queda avisa y no se guarda", async ({ page }) => {
    const montaje = await montar("NoCabe");
    await apuntar(montaje.gastoId, 400, 15);

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    const alta = seccion(page, pagos.nuevaTitulo);
    await alta
      .getByLabel(pagos.campoGasto, { exact: true })
      .selectOption({ label: montaje.concepto });
    await alta.getByLabel(pagos.campoImporte, { exact: true }).fill("700");
    await alta.getByLabel(pagos.campoVencimiento, { exact: true }).fill("2027-06-12");
    await alta.getByRole("button", { name: pagos.crear }).click();

    await esperarEstado(page, "no-cabe");

    /*
      SE BUSCA EL AVISO POR SU TEXTO Y NO POR `getByRole("alert")`.

      Next pinta su propio anunciador de ruta —un `div` con `role="alert"` que
      lee el título de la página a los lectores de pantalla—, así que el papel
      `alert` devuelve DOS elementos y Playwright se niega a elegir. El texto
      sale del copy, no copiado a mano: si cambia la frase, cambia el test con
      ella.
    */
    const avisoNoCabe = pagos.errorNoCabe.split("{queda}")[0].trim();

    // Y lleva la cifra: quedan 600 de los 1.000, y 700 no caben.
    await expect(page.getByText(avisoNoCabe)).toContainText("600,00");

    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.pagos
         where partida_id = ${montaje.gastoId} and importe = 700
      `,
    );
    expect(filas, "un pago que no cabe no puede quedar escrito").toHaveLength(0);
  });

  /**
   * UN PAGO DE UN GASTO QUE YA SE HABÍA PASADO SE PUEDE SEGUIR EDITANDO.
   *
   * Si los pagos suman más que el gasto —de antes de que la base lo impidiera,
   * o porque se apuntaron con el gasto todavía a cero—, cambiar sólo la fecha
   * de uno respondía «no cabe»: se comprobaba el tope aunque el dinero no se
   * moviera. Ahora sólo se comprueba si cambia el importe o el gasto.
   */
  test("cambiar sólo la fecha de un pago no pregunta si cabe", async ({ page }) => {
    const montaje = await montar("Pasado");
    const [primero] = await conBase(async (sql) => {
      // Con el gasto a cero no hay tope; al subirlo a 1.000 queda por debajo.
      await sql`update public.partidas_presupuesto set importe_estimado = 0 where id = ${montaje.gastoId}`;
      const pagosCreados = await sql<{ id: string }[]>`
        insert into public.pagos (partida_id, importe, fecha_vencimiento)
        values (${montaje.gastoId}, 600, current_date + 10), (${montaje.gastoId}, 600, current_date + 20)
        returning id
      `;
      await sql`update public.partidas_presupuesto set importe_estimado = 1000 where id = ${montaje.gastoId}`;
      return pagosCreados;
    });

    await entrar(page);
    await page.goto(`${RUTA_PAGOS}?editar=${primero.id}#pago-${primero.id}`);

    const fila = filaDe(page, primero.id);
    await fila.getByLabel(pagos.campoVencimiento, { exact: true }).fill("2027-07-01");
    await fila.getByRole("button", { name: pagos.guardar }).click();
    await esperarEstado(page, "pago-editado");

    const [movido] = await conBase(
      (sql) => sql<{ fecha: string }[]>`
        select fecha_vencimiento::text as fecha from public.pagos where id = ${primero.id}
      `,
    );
    expect(movido.fecha).toBe("2027-07-01");

    // CASO DE ERROR · subirle el importe sí se comprueba, y no cabe.
    await page.goto(`${RUTA_PAGOS}?editar=${primero.id}#pago-${primero.id}`);
    await filaDe(page, primero.id).getByLabel(pagos.campoImporte, { exact: true }).fill("650");
    await filaDe(page, primero.id).getByRole("button", { name: pagos.guardar }).click();
    await esperarEstado(page, "no-cabe");

    const [igual] = await conBase(
      (sql) => sql<{ importe: string }[]>`
        select importe from public.pagos where id = ${primero.id}
      `,
    );
    expect(Number(igual.importe)).toBe(600);
  });

  /**
   * «MARCAR PAGADO» DESDE UNA PANTALLA VIEJA NO REESCRIBE LA FECHA.
   *
   * Con el pago ya marcado en otra pestaña (o en el móvil del otro), pulsar el
   * botón que seguía en esta le ponía la fecha de hoy encima de la de verdad,
   * y ésa no se podía recuperar.
   */
  test("marcar pagado lo que ya estaba pagado no cambia su fecha", async ({ page }) => {
    const montaje = await montar("Viejo");
    const pago = await apuntar(montaje.gastoId, 200, 5);
    const borrado = await apuntar(montaje.gastoId, 100, 6);

    await entrar(page);
    await page.goto(RUTA_PAGOS);
    await expect(
      filaDe(page, pago).getByRole("button", { name: pagos.marcarPagado }),
    ).toBeVisible();

    // Mientras, alguien lo marca en otro sitio, con su fecha.
    await conBase(
      (sql) => sql`update public.pagos set pagado_en = '2027-01-15' where id = ${pago}`,
    );

    await filaDe(page, pago).getByRole("button", { name: pagos.marcarPagado }).click();
    await esperarEstado(page, "marcado-pagado");

    const [sigue] = await conBase(
      (sql) => sql<{ fecha: string }[]>`
        select pagado_en::text as fecha from public.pagos where id = ${pago}
      `,
    );
    expect(sigue.fecha, "la fecha en que se pagó de verdad no se toca").toBe("2027-01-15");

    // CASO DE ERROR · el otro lo borró: se dice, en vez de «sin permiso».
    await page.goto(RUTA_PAGOS);
    await expect(
      filaDe(page, borrado).getByRole("button", { name: pagos.marcarPagado }),
    ).toBeVisible();
    await conBase((sql) => sql`delete from public.pagos where id = ${borrado}`);
    await filaDe(page, borrado).getByRole("button", { name: pagos.marcarPagado }).click();
    await esperarEstado(page, "no-existe");
    await expect(page.getByText(pagos.errorNoExiste)).toBeVisible();
  });

  /**
   * CASO DE ERROR · si los pagos no se pueden leer, no se dice que no hay.
   *
   * «Todavía no hay ningún pago apuntado» es lo que pintaba la pantalla ante
   * una lectura caída, porque el lector devolvía una lista vacía. Con los
   * vencimientos de la boda, eso es lo único que esta pantalla no puede decir
   * sin saberlo. Se simula quitándole a `authenticated` la vista que lee, y se
   * devuelve al acabar.
   */
  /**
   * LOS MESES, CON LA PREPOSICIÓN EN MINÚSCULA.
   *
   * El título de cada mes llevaba `capitalize` de CSS, que pone mayúscula a
   * cada palabra: «Octubre De 2026». La semilla tiene pagos por venir, así que
   * siempre hay al menos un mes que mirar.
   */
  test("cada mes se titula «Octubre de 2026», no «Octubre De 2026»", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_PAGOS);

    const meses = page.getByRole("heading", { level: 2, name: / de \d{4}$/ });
    await expect(meses.first()).toBeVisible();
    for (const mes of await meses.allInnerTexts()) {
      expect(mes, "mayúscula sólo en la primera letra").toMatch(/^\p{Lu}[\p{Ll}]+ de \d{4}$/u);
    }
  });

  test("si los pagos no se pueden leer, no dice que no hay ninguno", async ({ page }) => {
    await entrar(page);

    try {
      await conBase((sql) => sql`revoke select on public.v_pagos from authenticated`);
      await page.goto(RUTA_PAGOS);

      await expect(page.getByRole("heading", { name: copy.panel.errorTitulo })).toBeVisible();
      await expect(page.getByText(pagos.vacio)).toHaveCount(0);
    } finally {
      await conBase((sql) => sql`grant select on public.v_pagos to authenticated`);
    }
  });

  /**
   * UN 31 DE FEBRERO SE DICE COMO TAL, NO COMO UNA AVERÍA.
   *
   * La acción mira la forma de la fecha y el calendario lo pone la base, que
   * contesta 22008. Esa respuesta acababa en «No se ha podido guardar». El
   * campo es de tipo fecha y no deja escribirla; llega así desde un navegador
   * sin selector de fechas, que es el caso que se simula.
   */
  test("una fecha que no existe se explica y no apunta el pago", async ({ page }) => {
    const montaje = await montar("Febrero");

    await entrar(page);
    await page.goto(RUTA_PAGOS);
    await page.waitForLoadState("networkidle");

    const alta = seccion(page, pagos.nuevaTitulo);
    await alta
      .getByLabel(pagos.campoGasto, { exact: true })
      .selectOption({ label: montaje.concepto });
    await alta.getByLabel(pagos.campoImporte, { exact: true }).fill("100");
    /*
      EL VALOR SE ESCRIBE EN EL ELEMENTO, SIN PASAR POR REACT. Tras cada evento
      de teclado React le devuelve al `<input>` el `type` de sus propiedades:
      con `fill` el campo volvía a ser de fecha, el 31 de febrero se quedaba en
      nada y el `required` paraba el envío sin que saliera ninguna petición.
      Al enviar, React lee el formulario del DOM, así que el valor viaja igual.
    */
    const vencimiento = alta.getByLabel(pagos.campoVencimiento, { exact: true });
    await vencimiento.evaluate((campo: HTMLInputElement) => {
      campo.type = "text";
      campo.value = "2027-02-31";
    });
    await expect(vencimiento, "la fecha imposible tiene que llegar escrita").toHaveValue(
      "2027-02-31",
    );
    await alta.getByRole("button", { name: pagos.crear }).click();

    await esperarEstado(page, "fecha");
    await expect(page.getByText(pagos.errorFecha)).toBeVisible();
    const filas = await conBase(
      (sql) => sql`select 1 from public.pagos where partida_id = ${montaje.gastoId}`,
    );
    expect(filas, "no se apunta nada").toHaveLength(0);
  });

  /**
   * LO VENCIDO SE DISTINGUE SIN EL COLOR.
   *
   * Es un criterio de aceptación del ticket y no un adorno: el recuadro rojo no
   * lo lee ni un daltónico, ni un lector de pantalla, ni nadie con el sol dando
   * en el móvil. Así que se comprueba la palabra.
   */
  test("lo vencido y sin pagar lleva su palabra, no sólo el color", async ({ page }) => {
    const montaje = await montar("Atrasado");
    const atrasado = await apuntar(montaje.gastoId, 250, -7);

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    const vencidos = seccion(page, pagos.vencidosTitulo);
    await expect(vencidos, "un pago con fecha pasada tiene que salir aquí").toBeVisible();
    await expect(
      filaDe(page, atrasado).getByText(pagos.vencido, { exact: true }),
      "la palabra tiene que estar en la fila, no sólo el color",
    ).toBeVisible();

    // Y en cuanto se paga, deja de estar vencido: `vencido` mira `pagado_en`.
    await filaDe(page, atrasado).getByRole("button", { name: pagos.marcarPagado }).click();
    await esperarEstado(page, "marcado-pagado");

    await expect(filaDe(page, atrasado).getByText(pagos.vencido, { exact: true })).toHaveCount(
      0,
    );
  });

  /**
   * DESHACER UN «PAGADO» PUESTO POR ERROR.
   *
   * Se marca la fila de al lado justo el día que se apuntan cinco seguidos, y
   * sin vuelta atrás la única salida sería borrar el pago y volver a escribirlo.
   */
  test("un pagado por error se puede deshacer", async ({ page }) => {
    const montaje = await montar("Deshacer");
    const pago = await apuntar(montaje.gastoId, 300, 20);

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    /*
      LA FOTO DE PARTIDA, Y NO SÓLO POR DOCUMENTAR.

      Pulsar en seco nada más llegar es como se pierde un envío: los specs que
      nunca fallan rellenan un formulario antes, y ese rato es el que la página
      necesita para quedar viva. Aquí no hay nada que rellenar, así que se
      comprueba lo que debería verse antes de tocar —la fila y su botón— y eso
      hace las dos cosas: deja escrito el estado inicial y espera a que el botón
      sea de verdad pulsable.
    */
    const filaPago = filaDe(page, pago);
    await expect(filaPago, "la fila del pago tiene que estar antes de marcarla").toBeVisible();
    const marcarPago = filaPago.getByRole("button", { name: pagos.marcarPagado });
    await expect(marcarPago).toBeEnabled();
    await marcarPago.click();
    await esperarEstado(page, "marcado-pagado");
    expect(await pendienteDe(montaje.categoriaId)).toBe(0);

    await filaDe(page, pago).getByRole("button", { name: pagos.deshacerPago }).click();
    await esperarEstado(page, "marcado-pendiente");

    const [vuelto] = await conBase(
      (sql) => sql<{ pagado_en: string | null }[]>`
        select pagado_en from public.pagos where id = ${pago}
      `,
    );
    expect(vuelto.pagado_en, "deshacer tiene que borrar la fecha").toBeNull();
    expect(await pendienteDe(montaje.categoriaId), "y devolver el importe a lo pendiente").toBe(
      300,
    );
  });

  /**
   * QUIÉN PAGA, CON NOMBRE CUANDO ES «OTROS».
   *
   * La mitad que se olvida es la segunda: elegir «Otros» y no decir quién deja
   * la columna diciendo menos que si estuviera vacía.
   */
  test("«otros» exige decir quién paga", async ({ page }) => {
    const montaje = await montar("Pagador");

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    const alta = seccion(page, pagos.nuevaTitulo);
    await alta
      .getByLabel(pagos.campoGasto, { exact: true })
      .selectOption({ label: montaje.concepto });
    await alta.getByLabel(pagos.campoImporte, { exact: true }).fill("120");
    await alta.getByLabel(pagos.campoVencimiento, { exact: true }).fill("2027-05-02");
    await alta
      .getByLabel(pagos.campoPaga, { exact: true })
      .selectOption({ label: pagos.pagadores.otros });
    await alta.getByRole("button", { name: pagos.crear }).click();

    await esperarEstado(page, "pagador");
    await expect(page.getByText(pagos.errorPagador)).toBeVisible();

    // Con el nombre puesto sí entra, y queda guardado con él.
    const segundo = seccion(page, pagos.nuevaTitulo);
    await segundo
      .getByLabel(pagos.campoGasto, { exact: true })
      .selectOption({ label: montaje.concepto });
    await segundo.getByLabel(pagos.campoImporte, { exact: true }).fill("120");
    await segundo.getByLabel(pagos.campoVencimiento, { exact: true }).fill("2027-05-02");
    await segundo
      .getByLabel(pagos.campoPaga, { exact: true })
      .selectOption({ label: pagos.pagadores.otros });
    await segundo.getByLabel(pagos.campoPagaDetalle, { exact: true }).fill("Los padrinos");
    await segundo.getByRole("button", { name: pagos.crear }).click();

    await esperarEstado(page, "pago-creado");

    const [guardado] = await conBase(
      (sql) => sql<{ paga: string; paga_detalle: string }[]>`
        select paga, paga_detalle from public.pagos where partida_id = ${montaje.gastoId}
      `,
    );
    expect(guardado.paga).toBe("otros");
    expect(guardado.paga_detalle).toBe("Los padrinos");
  });

  /**
   * BORRAR UN PAGO PREGUNTA ANTES. «Borrar» está justo debajo de «Marcar
   * pagado», y un toque de más en el móvil se llevaba el pago con sus notas
   * sin vuelta atrás. El primer toque no borra; la confirmación, sí.
   */
  test("borrar un pago pregunta antes, y sólo la confirmación lo borra", async ({ page }) => {
    const montaje = await montar("Borrar");
    const pago = await apuntar(montaje.gastoId, 250, 30);

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    const fila = filaDe(page, pago);
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: pagos.borrar, exact: true }).click();
    await esperarEstado(page, "confirmar-borrado");

    // La pregunta sale en el propio pago, y el pago sigue ahí.
    await expect(filaDe(page, pago)).toContainText(pagos.avisoConfirmarBorrado);
    const [sigue] = await conBase(
      (sql) => sql<{ id: string }[]>`select id from public.pagos where id = ${pago}`,
    );
    expect(sigue?.id, "el primer toque no puede borrar nada").toBe(pago);

    await filaDe(page, pago).getByRole("button", { name: pagos.confirmarBorrado }).click();
    await esperarEstado(page, "pago-borrado");

    const quedan = await conBase(
      (sql) => sql<{ id: string }[]>`select id from public.pagos where id = ${pago}`,
    );
    expect(quedan, "confirmado, se borra").toHaveLength(0);
  });

  /**
   * LA FECHA DE PAGO SE PUEDE CORREGIR. «Marcar pagado» apunta hoy, y la señal
   * pagada en marzo y apuntada en octubre salía en la gráfica en octubre, sin
   * forma de cambiarlo.
   *
   * CASO DE ERROR · un día que todavía no ha llegado no es un pago hecho: se
   * explica y no se guarda.
   */
  test("la fecha de pago se corrige al editar, y una futura se rechaza", async ({ page }) => {
    const montaje = await montar("FechaPago");
    const pago = await apuntar(montaje.gastoId, 500, 5);

    await entrar(page);
    await page.goto(`${RUTA_PAGOS}?editar=${pago}`);

    const fila = filaDe(page, pago);
    await fila.getByLabel(pagos.campoPagadoEn, { exact: true }).fill("2026-03-10");
    await fila.getByRole("button", { name: pagos.guardar }).click();
    await esperarEstado(page, "pago-editado");

    const [guardado] = await conBase(
      (sql) => sql<{ pagado_en: string | null }[]>`
        select pagado_en::text from public.pagos where id = ${pago}
      `,
    );
    expect(guardado.pagado_en, "se guarda el día que se escribió").toBe("2026-03-10");
    await expect(filaDe(page, pago)).toContainText(`${pagos.pagadoEl} 10 de marzo de 2026`);

    await page.goto(`${RUTA_PAGOS}?editar=${pago}`);
    await filaDe(page, pago)
      .getByLabel(pagos.campoPagadoEn, { exact: true })
      .fill("2099-01-01");
    await filaDe(page, pago).getByRole("button", { name: pagos.guardar }).click();
    await esperarEstado(page, "fecha-pago");

    await expect(filaDe(page, pago)).toContainText(pagos.errorFechaPago);
    const [sinCambio] = await conBase(
      (sql) => sql<{ pagado_en: string | null }[]>`
        select pagado_en::text from public.pagos where id = ${pago}
      `,
    );
    expect(sinCambio.pagado_en, "una fecha futura no se guarda").toBe("2026-03-10");
  });

  /**
   * EL ALTA NO ELIGE EL GASTO POR VOSOTROS. El primero de la lista venía
   * marcado, y un pago apuntado sin tocar ese campo se colgaba de un gasto que
   * nadie había elegido. Ahora empieza vacío; y si llega vacío al servidor —sin
   * el `required` del navegador— se explica junto al alta, que está al final.
   */
  test("el alta empieza sin gasto elegido, y sin elegirlo se explica junto a ella", async ({
    page,
  }) => {
    await montar("SinGasto");

    await entrar(page);
    await page.goto(RUTA_PAGOS);

    // «Queda por pagar» es la cifra de la portada, y aquí no es la misma.
    await expect(
      page.getByRole("term").filter({ hasText: copy.panel.resumen.quedaPorPagar }),
    ).toHaveCount(0);

    const alta = seccion(page, pagos.nuevaTitulo);
    const gasto = alta.getByLabel(pagos.campoGasto, { exact: true });
    await expect(gasto, "ningún gasto viene elegido").toHaveValue("");

    await gasto.evaluate((campo) => campo.removeAttribute("required"));
    await alta.getByLabel(pagos.campoImporte, { exact: true }).fill("80");
    await alta.getByLabel(pagos.campoVencimiento, { exact: true }).fill("2027-04-04");
    await alta.getByRole("button", { name: pagos.crear }).click();
    await esperarEstado(page, "gasto");

    await expect(page).toHaveURL(/#nuevo-pago$/);
    await expect(seccion(page, pagos.nuevaTitulo)).toContainText(pagos.errorGasto);
  });

  /**
   * CERO FILAS NO ES «NO PODÉIS». Con el pago borrado desde el otro móvil, a
   * quien sí puede editar le salía «vuestro perfil no puede hacer cambios
   * aquí» —o un «no cabe» sobre un pago que ya no existía—.
   */
  test("guardar un pago que otro ya borró dice que no está, no que no podéis", async ({
    page,
  }) => {
    const montaje = await montar("YaNoEsta");
    const pago = await apuntar(montaje.gastoId, 150, 12);

    await entrar(page);
    await page.goto(`${RUTA_PAGOS}?editar=${pago}`);
    const guardar = filaDe(page, pago).getByRole("button", { name: pagos.guardar });
    await expect(guardar).toBeEnabled();

    await conBase((sql) => sql`delete from public.pagos where id = ${pago}`);
    await guardar.click();
    await esperarEstado(page, "no-existe");

    await expect(page.getByText(pagos.errorNoExiste)).toBeVisible();
    await expect(page.getByText(pagos.errorSinPermiso)).toHaveCount(0);
  });
});
