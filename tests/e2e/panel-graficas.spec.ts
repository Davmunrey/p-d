import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_GRAFICAS,
  RUTA_PANEL,
  RUTA_PRESUPUESTO,
} from "../../src/config/constants";

/**
 * BODA-63 (#49) · CÓMO VA EL DINERO
 *
 * LO QUE HAY QUE PROBAR DE UNA GRÁFICA NO ES QUE SE VEA BONITA: es que diga la
 * verdad y que se pueda leer sin verla. Así que aquí se comprueban esas dos
 * cosas y no el aspecto.
 *
 * 1 · LA TABLA DICE LO MISMO QUE LA BASE. Es la parte accesible de la gráfica
 *     —el `<svg>` va `aria-hidden`—, así que si la tabla miente, para un lector
 *     de pantalla la pantalla entera miente.
 *
 * 2 · LA BARRA MIDE LO QUE TIENE QUE MEDIR. Se lee el `width` del `<rect>` y se
 *     compara con la proporción que le toca. Sin esto, una gráfica con todas
 *     las barras iguales pasaría el test de la tabla tan tranquila.
 *
 * Y el caso de error del ticket —sin datos se explica en vez de dibujar ejes
 * vacíos— tiene su propio test, que es el que de verdad se olvida.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Gráficas";

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

interface Sembrado {
  grande: string;
  pequena: string;
  importeGrande: number;
  importePequeno: number;
}

/**
 * Dos categorías con gasto real, una el triple que la otra.
 *
 * LA PROPORCIÓN ES EL DATO, y por eso son 3000 y 1000 y no dos cifras
 * cualesquiera: con el triple exacto, la barra pequeña tiene que medir un tercio
 * de la grande, y eso se puede afirmar sin margen. Con 2870 y 1130 habría que
 * comparar con tolerancia y el test dejaría de cazar un error del 5 %.
 */
async function sembrar(sello: number): Promise<Sembrado> {
  const grande = `${MARCA} Catering ${sello}`;
  const pequena = `${MARCA} Flores ${sello}`;
  const importeGrande = 3000;
  const importePequeno = 1000;

  /*
    SE SIEMBRA SOBRE LIMPIO. Sin esto, cada test añade dos categorías más y a la
    tercera el nombre de una categoría sale en dos tablas distintas de la misma
    pantalla: Playwright corta con «strict mode violation» y el fallo sólo
    aparece a partir del segundo test.
  */
  await limpiar();

  await conBase(async (sql) => {
    for (const [nombre, previsto, real] of [
      [grande, 2500, importeGrande],
      [pequena, 1500, importePequeno],
    ] as const) {
      const [categoria] = await sql<{ id: string }[]>`
        insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
        values (${nombre}, ${previsto}, 90)
        returning id
      `;

      const [partida] = await sql<{ id: string }[]>`
        insert into public.partidas_presupuesto
          (categoria_id, concepto, importe_estimado, importe_real)
        values (${categoria.id}, ${`${nombre} concepto`}, ${real}, ${real})
        returning id
      `;

      /*
        UN PAGO HECHO, para que la evolución tenga algo que dibujar. La fecha va
        fija y en el pasado: si fuera «hoy», el mes de la gráfica cambiaría el
        día 1 y el test empezaría a fallar una vez al mes sin que nadie tocara
        nada.
      */
      await sql`
        insert into public.pagos (partida_id, importe, fecha_vencimiento, pagado_en)
        values (${partida.id}, ${real}, ${"2026-03-10"}, ${"2026-03-10T10:00:00Z"})
      `;
    }
  });

  return { grande, pequena, importeGrande, importePequeno };
}

async function limpiar() {
  if (!cadena) return;
  await conBase(async (sql) => {
    await sql`
      delete from public.pagos where partida_id in (
        select p.id from public.partidas_presupuesto as p
        join public.categorias_presupuesto as c on c.id = p.categoria_id
        where c.nombre like ${`${MARCA}%`})
    `;
    await sql`
      delete from public.partidas_presupuesto where categoria_id in (
        select id from public.categorias_presupuesto where nombre like ${`${MARCA}%`})
    `;
    await sql`delete from public.categorias_presupuesto where nombre like ${`${MARCA}%`}`;
  });
}

test.afterAll(limpiar);

test.describe("Las gráficas del presupuesto", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /** Una sección de la pantalla, por su titular. */
  const seccion = (pagina: Page, titulo: string) =>
    pagina.locator("section", { has: pagina.getByRole("heading", { name: titulo }) });

  /**
   * La fila de una categoría DENTRO de una sección.
   *
   * El ámbito no sobra: la misma categoría es `rowheader` en la tabla del
   * reparto y en la de previsto contra real, así que buscarla en la página
   * entera devuelve dos filas y Playwright se planta. Aquí se cayó el test.
   */
  const fila = (ambito: ReturnType<typeof seccion>, nombre: string, pagina: Page) =>
    ambito.locator("tr").filter({ has: pagina.getByRole("rowheader", { name: nombre }) });

  test("se llega desde el presupuesto y la tabla dice lo mismo que la base", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now());

    await entrar(page);
    await page.goto(RUTA_PRESUPUESTO);

    // La pantalla es alcanzable: un módulo al que no se llega no está entregado.
    await page.getByRole("link", { name: copy.panel.presupuesto.graficas.enlace }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_GRAFICAS));

    const grande = fila(
      seccion(page, copy.panel.presupuesto.graficas.repartoTitulo),
      sembrado.grande,
      page,
    );
    await expect(grande).toBeVisible();

    /*
      EL PORCENTAJE SE COMPRUEBA CONTRA LO QUE DICE LA BASE, no contra un número
      escrito aquí: el seed de desarrollo ya trae categorías con gasto, así que
      el reparto no es «75 % y 25 %» sino lo que salga con todo lo demás dentro.
      Calcularlo aquí a mano sería escribir la misma cuenta dos veces y creerse
      las dos.
    */
    const totalReal = await conBase(async (sql) =>
      Number(
        (
          await sql<{ total: string }[]>`
              select coalesce(sum(importe_real), 0) as total
                from public.partidas_presupuesto
            `
        )[0].total,
      ),
    );

    const esperado = ((sembrado.importeGrande / totalReal) * 100).toFixed(1);
    await expect(grande).toContainText(
      copy.panel.presupuesto.graficas.porcentaje.replace("{numero}", esperado),
    );
  });

  /**
   * LA BARRA MIDE LO QUE DICE LA CIFRA.
   *
   * Es el test que separa «hay una gráfica» de «la gráfica es correcta». Se
   * sembraron 3000 y 1000, así que la barra pequeña tiene que medir exactamente
   * un tercio de la grande — y como las dos se escalan contra la mayor de toda
   * la gráfica (que puede ser otra categoría del seed), lo que se afirma es la
   * RAZÓN entre las dos, que no depende de cuál sea la mayor.
   */
  test("la barra pequeña mide un tercio de la grande, porque gastó un tercio", async ({
    page,
  }) => {
    const sembrado = await sembrar(Date.now() + 1);

    await entrar(page);
    await page.goto(RUTA_GRAFICAS);

    const reparto = seccion(page, copy.panel.presupuesto.graficas.repartoTitulo);

    const anchoDe = async (categoria: string) => {
      const grupo = reparto.locator("svg g").filter({ hasText: categoria });
      const ancho = await grupo.locator("rect").first().getAttribute("width");
      return Number(ancho);
    };

    const anchoGrande = await anchoDe(sembrado.grande);
    const anchoPequena = await anchoDe(sembrado.pequena);

    expect(
      anchoGrande,
      "la barra de la categoría con más gasto tiene que existir",
    ).toBeGreaterThan(0);
    // Un tercio, con el margen de un píxel de redondeo del propio lienzo.
    expect(anchoPequena / anchoGrande).toBeCloseTo(
      sembrado.importePequeno / sembrado.importeGrande,
      2,
    );
  });

  /**
   * CASO DE ERROR DEL TICKET · ninguna gráfica se queda en blanco y callada.
   *
   * SE COMPRUEBA COMO INVARIANTE Y NO VACIANDO LA BASE, y la razón es de peso:
   * el trabajo de CI corre la suite entera contra UNA sola base compartida, así
   * que un `delete from pagos` aquí dejaría sin datos a los tests de pagos y de
   * presupuesto, que corren después. Un test que rompe a otro no es un test.
   *
   * Lo que se afirma vale con cualquier dato y es exactamente lo que pide el
   * ticket: cada sección tiene o su gráfica o su explicación. Lo que no puede
   * pasar —y es el fallo que se cuela sin que nadie lo vea— es una sección con
   * un lienzo en blanco y ni una palabra al lado.
   */
  test("ninguna gráfica se queda en blanco sin explicarse", async ({ page }) => {
    await sembrar(Date.now() + 2);

    await entrar(page);
    await page.goto(RUTA_GRAFICAS);

    const secciones = [
      {
        titulo: copy.panel.presupuesto.graficas.repartoTitulo,
        vacio: copy.panel.presupuesto.graficas.repartoVacio,
      },
      {
        titulo: copy.panel.presupuesto.graficas.evolucionTitulo,
        vacio: copy.panel.presupuesto.graficas.evolucionVacio,
      },
      {
        titulo: copy.panel.presupuesto.graficas.comparativaTitulo,
        vacio: copy.panel.presupuesto.graficas.comparativaVacio,
      },
    ];

    for (const { titulo, vacio } of secciones) {
      const ambito = seccion(page, titulo);
      await expect(ambito, `falta la sección «${titulo}»`).toBeVisible();

      const dibuja = await ambito.locator("svg").count();
      const explica = await ambito.getByText(vacio).count();

      expect(
        dibuja + explica,
        `«${titulo}» no dibuja nada y tampoco dice por qué`,
      ).toBeGreaterThan(0);

      // Y nunca las dos cosas: un lienzo con su cartel de «aquí no hay nada» al
      // lado es la contradicción que hace dudar de todas las demás cifras.
      expect(
        dibuja > 0 && explica > 0,
        `«${titulo}» dibuja y a la vez dice que no hay nada`,
      ).toBe(false);
    }
  });

  /**
   * TODA GRÁFICA LLEVA SU TABLA, y el `<svg>` no cuenta para quien no lo ve.
   *
   * Es el criterio de accesibilidad del ticket, y se comprueba estructuralmente:
   * cada `<svg>` de la pantalla está oculto a la accesibilidad, y hay al menos
   * tantas tablas como gráficas.
   */
  test("cada gráfica tiene su tabla y ningún svg se anuncia", async ({ page }) => {
    await sembrar(Date.now() + 2);

    await entrar(page);
    await page.goto(RUTA_GRAFICAS);

    /*
      SE RECORREN LAS SECCIONES Y NO `main svg`. Buscar por `main` ata el test a
      una etiqueta del layout que no tiene nada que ver con lo que se afirma; si
      un día el panel envuelve el contenido de otra forma, este test se cae
      diciendo «no hay gráficas» cuando las hay. Las secciones son de esta
      pantalla y son lo que se está comprobando.
    */
    let dibujadas = 0;

    for (const titulo of [
      copy.panel.presupuesto.graficas.repartoTitulo,
      copy.panel.presupuesto.graficas.evolucionTitulo,
      copy.panel.presupuesto.graficas.comparativaTitulo,
    ]) {
      const ambito = seccion(page, titulo);
      const svgs = ambito.locator("svg");
      const cuantas = await svgs.count();

      for (let i = 0; i < cuantas; i += 1) {
        await expect(
          svgs.nth(i),
          "un `<svg>` sin `aria-hidden` se le lee a alguien como un montón de nada",
        ).toHaveAttribute("aria-hidden", "true");
      }

      // Y si dibuja, tiene su tabla al lado: es la parte que sí se puede leer.
      if (cuantas > 0) {
        dibujadas += cuantas;
        expect(
          await ambito.locator("table").count(),
          `«${titulo}» dibuja pero no trae tabla`,
        ).toBeGreaterThanOrEqual(cuantas);
      }
    }

    expect(dibujadas, "tiene que haber alguna gráfica que comprobar").toBeGreaterThan(0);
  });
});
