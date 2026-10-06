import { expect, test, type Page } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL } from "../../src/config/constants";
import { formateadorDeImporte } from "../../src/lib/importe";

/**
 * BODA-43 · LA PORTADA DEL PANEL CONTESTA A LO QUE SE PEDÍA
 *
 * «Cuánta gente ha contestado, cuánto llevamos gastado y qué se nos echa
 * encima.» Las dos últimas faltaban: la portada se quedó en invitados,
 * logística y cocina. Aquí se prueba contra la base de verdad lo que el ticket
 * pedía como camino feliz —dar de alta un gasto cambia el total de la
 * portada— y que lo que vence sale delante y marcado.
 *
 * Los estados vacíos —sin presupuesto, sin pagos, sin tareas, sin moneda— se
 * prueban en `tests/unidad/resumen-vacio.test.tsx`: contra la semilla
 * compartida no se puede llegar a ninguno sin vaciar una base que usan todos.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Resumen";

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

/** El valor de una cifra de la portada, por su rótulo. */
function cifra(pagina: Page, rotulo: string) {
  return pagina
    .getByRole("term")
    .filter({ hasText: rotulo })
    .locator("xpath=following-sibling::dd[1]");
}

/** Una de las dos listas de «lo que se os echa encima», por su nombre. */
function lista(pagina: Page, nombre: string) {
  return pagina.getByRole("list", { name: nombre });
}

/** Lo que va costando la boda entera, sumado por la base. */
async function vaCostandoSegunLaBase(): Promise<number> {
  const [fila] = await conBase(
    (sql) => sql<{ total: string }[]>`
      select coalesce(sum(importe_previsto - desviacion), 0) as total
        from public.v_resumen_presupuesto
    `,
  );
  return Number(fila.total);
}

async function comoSeEscribenLosImportes(): Promise<(importe: number) => string> {
  const [configuracion] = await conBase(
    (sql) => sql<{ moneda: string }[]>`select moneda from public.configuracion_boda limit 1`,
  );
  return formateadorDeImporte(configuracion.moneda);
}

test.describe("La portada del panel", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.afterAll(async () => {
    if (!cadena) return;
    await conBase(async (sql) => {
      await sql`delete from public.tareas where titulo like ${`${MARCA}%`}`;
      await sql`
        delete from public.partidas_presupuesto where categoria_id in (
          select id from public.categorias_presupuesto where nombre like ${`${MARCA}%`}
        )
      `;
      await sql`delete from public.categorias_presupuesto where nombre like ${`${MARCA}%`}`;
    });
  });

  /**
   * CAMINO FELIZ · dar de alta un gasto cambia lo que va costando en la
   * portada. Se compara con lo que suma la base y, como los demás tests escriben
   * a la vez, se relee hasta que cuadran: lo que se prueba es que la portada
   * dice lo mismo que la base, y que el gasto nuevo está dentro.
   */
  test("un gasto nuevo cambia lo que va costando en la portada", async ({ page }) => {
    const euros = await comoSeEscribenLosImportes();
    await entrar(page);

    const antes = await vaCostandoSegunLaBase();
    await conBase(async (sql) => {
      const [categoria] = await sql<{ id: string }[]>`
        insert into public.categorias_presupuesto (nombre, importe_previsto, orden)
        values (${`${MARCA} ${Date.now()}`}, 0, 90)
        returning id
      `;
      await sql`
        insert into public.partidas_presupuesto (categoria_id, concepto, importe_estimado)
        values (${categoria.id}, ${`${MARCA} Gasto`}, 1234.5)
      `;
    });
    expect(await vaCostandoSegunLaBase()).toBeGreaterThanOrEqual(antes + 1234.5);

    await expect(async () => {
      const total = await vaCostandoSegunLaBase();
      await page.goto(RUTA_PANEL);
      await expect(cifra(page, copy.panel.resumen.vaCostando)).toHaveText(euros(total), {
        timeout: 1_000,
      });
    }).toPass({ timeout: 60_000 });
  });

  /**
   * LO VENCIDO SALE DELANTE Y MARCADO CON PALABRA. Una tarea con el plazo
   * muy pasado es la más urgente de cualquier lista, así que sale la primera
   * aunque otros tests hayan dejado las suyas.
   */
  test("una tarea vencida sale la primera de la semana, marcada", async ({ page }) => {
    const titulo = `${MARCA} Vencida ${Date.now()}`;
    await conBase(
      (sql) => sql`
        insert into public.tareas (titulo, fecha_limite) values (${titulo}, '2000-01-01')
      `,
    );

    await entrar(page);
    await page.goto(RUTA_PANEL);

    const primera = lista(page, copy.panel.resumen.tareasSemana).getByRole("listitem").first();
    await expect(primera).toContainText(titulo);
    await expect(primera).toContainText(copy.panel.tareas.vencida);
  });

  /**
   * CASO DE ERROR · una tarea ya hecha no se os echa encima, por pasado que
   * esté su plazo. Si saliera, la lista avisaría de lo que ya no hay que hacer
   * y dejaría de mirarse.
   */
  test("una tarea hecha no sale entre las de la semana, aunque su plazo pasara", async ({
    page,
  }) => {
    const titulo = `${MARCA} Hecha ${Date.now()}`;
    await conBase(
      (sql) => sql`
        insert into public.tareas (titulo, fecha_limite, estado)
        values (${titulo}, '2000-01-01', 'hecha')
      `,
    );

    await entrar(page);
    await page.goto(RUTA_PANEL);

    await expect(
      page.getByRole("heading", { name: copy.panel.resumen.tareasSemana }),
    ).toBeVisible();
    await expect(page.getByText(titulo)).toHaveCount(0);
  });
});
