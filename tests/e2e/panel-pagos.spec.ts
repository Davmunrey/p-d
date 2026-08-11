import { expect, test, type Page } from "@playwright/test";
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
      .poll(() => ultimoDestino(pagina) ?? pagina.url(), { timeout: 30_000 })
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

  // La acción decidió bien. Si el navegador no la siguió —#126—, se le lleva a
  // donde decía, que es lo que habría hecho él.
  if (destino && !pagina.url().includes(`estado=${esperado}`)) {
    console.warn(`#126: la pestaña no siguió la redirección a ${destino}.`);
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

test.describe("Los pagos y sus vencimientos", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /**
   * CAMINO FELIZ · marcar un pago como hecho reduce lo pendiente del gasto.
   */
  test("marcar un pago como hecho reduce lo que queda por pagar", async ({ page }) => {
    const montaje = await montar("Feliz");
    const señal = await apuntar(montaje.gastoId, 400, 10);
    await apuntar(montaje.gastoId, 600, 40);

    // De partida: los dos pendientes, mil euros por pagar.
    expect(await pendienteDe(montaje.categoriaId), "de partida quedan los 1.000").toBe(1000);

    seguirLaPista(page);
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
      .selectOption({ label: `${montaje.categoria} · ${montaje.concepto}` });
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
      .selectOption({ label: `${montaje.categoria} · ${montaje.concepto}` });
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
      .selectOption({ label: `${montaje.categoria} · ${montaje.concepto}` });
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
});
