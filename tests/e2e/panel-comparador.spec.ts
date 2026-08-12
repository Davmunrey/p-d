import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  PORCENTAJE_IVA,
  RUTA_ACCESO,
  RUTA_COMPARADOR,
  RUTA_PANEL,
  RUTA_PROVEEDORES,
} from "../../src/config/constants";
import { formateadorDeImporte } from "../../src/lib/importe";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-73 · Comparar los presupuestos de una categoría
 *
 * LO QUE JUSTIFICA EL TICKET ES EL IVA, y por eso los tres candidatos que se
 * siembran son tres casos distintos y no tres números: uno da la cifra sin IVA,
 * otro con IVA dentro, y el tercero NO LO DICE. Los tres se ponen en la misma
 * base menos el tercero, del que no se inventa nada — que es exactamente lo que
 * hay que comprobar, porque suponerlo se equivoca en un 21 % justo cuando más
 * caro sale.
 *
 * Y LA SEGUNDA MITAD: elegir. «Marcar elegido» tiene que escribir de verdad en
 * la base, y —esto es lo que se vigila aquí— NO puede ser una segunda puerta a
 * «contratado» que se salte el aviso de tener ya a otro contratado en la misma
 * categoría.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Comparador";

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/**
 * CÓMO SE ESCRIBE UN IMPORTE — PREGUNTÁNDOSELO A QUIEN LOS ESCRIBE.
 *
 * Aquí había tres cifras a mano —«2.000,00», «3.630,00», «1.800,00»— y las tres
 * estaban mal, pero no por poco: estaban mal por creer que el punto de los
 * millares va siempre. En castellano no va. La RAE deja los números de cuatro
 * cifras sin separador —2000, no 2.000— y `Intl.NumberFormat` con `es-ES` hace
 * exactamente eso: agrupa a partir de cinco. La pantalla llevaba razón.
 *
 * Y ES LA SEGUNDA VEZ que este proyecto tropieza con lo mismo: el test del
 * presupuesto ya se cayó por escribir «1.250,50» donde la página pone
 * «1250,50». Escribir la cifra a mano por tercera vez sería pedir la tercera.
 *
 * Así que no se escribe: se le pide el formato al mismo módulo que lo aplica en
 * la pantalla, con la moneda que hay de verdad en la configuración de la boda.
 * Si mañana cambia la moneda —o la regla de agrupar—, este test sigue diciendo
 * lo que quiere decir, que es «la cifra sale como salen las cifras del panel»,
 * y no «la cifra sale con un punto».
 */
async function comoSeEscribenLosImportes(): Promise<(importe: number) => string> {
  const [configuracion] = await conBase(
    (sql) => sql<{ moneda: string }[]>`select moneda from public.configuracion_boda limit 1`,
  );
  return formateadorDeImporte(configuracion.moneda);
}

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

const SIN_DESTINO = "(ninguna acción ha redirigido: ¿llegó a enviarse el formulario?)";

/** El mismo ayudante del molde: se afirma el destino que devolvió la acción. */
async function esperarEstado(pagina: Page, esperado: string) {
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
  olvidarDestinos(pagina);

  if (destino && !pagina.url().includes(`estado=${esperado}`)) {
    console.warn(`#126: la pestaña no siguió la redirección a ${destino}.`);
    await pagina.goto(destino);
  }

  await pagina.waitForLoadState("networkidle");
}

/**
 * Un renglón de la comparativa, por su concepto.
 *
 * SE AFIRMA POR FILA Y NO SOBRE LA PÁGINA ENTERA. «2000,00» sale dos veces —es
 * lo presupuestado por uno y lo que otro pide sin IVA— y buscarlo suelto daría
 * por buena la cifra equivocada. Un `th scope="row"` es un `rowheader`, así que
 * la fila se localiza por lo que significa y no por su posición.
 *
 * SIN `exact`, Y NO ES DEJADEZ: los conceptos van en versalita —`uppercase` de
 * CSS— y `exact` en Playwright significa además «distinguiendo mayúsculas». El
 * texto del copy se escribe como se escribe en castellano, así que la
 * comparación tiene que ser la insensible, que es la de por defecto. Es lo
 * mismo que ya hacen los botones del panel, que también van en versalita.
 */
function fila(pagina: Page, concepto: string) {
  return pagina
    .locator("tr")
    .filter({ has: pagina.getByRole("rowheader", { name: concepto }) });
}

interface Sembrado {
  categoriaId: string;
  sinIva: string;
  conIva: string;
  calla: string;
  idSinIva: string;
}

/**
 * Una categoría nueva con tres candidatos, uno por cada respuesta posible al
 * IVA. Los importes están elegidos para que las conversiones salgan redondas y
 * un fallo se lea sin calculadora: 2000 + 21 % = 2420, y 3630 − 21 % = 3000.
 */
async function sembrar(sello: number): Promise<Sembrado> {
  const sinIva = `${MARCA} Sin IVA ${sello}`;
  const conIva = `${MARCA} Con IVA ${sello}`;
  const calla = `${MARCA} No lo dice ${sello}`;

  return conBase(async (sql) => {
    const [categoria] = await sql<{ id: string }[]>`
      insert into public.categorias_proveedor (nombre, orden)
      values (${`${MARCA} Categoría ${sello}`}, 60)
      returning id
    `;

    const alta = async (nombre: string, importe: number, iva: boolean | null) => {
      const [proveedor] = await sql<{ id: string }[]>`
        insert into public.proveedores
          (categoria_id, nombre, importe_presupuestado, iva_incluido, valoracion)
        values (${categoria.id}, ${nombre}, ${importe}, ${iva}, 4)
        returning id
      `;
      return proveedor.id;
    };

    const idSinIva = await alta(sinIva, 2000, false);
    await alta(conIva, 3630, true);
    await alta(calla, 1800, null);

    // Qué incluye: es la columna que decide de verdad cuando dos presupuestos
    // se parecen, así que la pantalla tiene que enseñarla.
    await sql`
      insert into public.servicios (proveedor_id, nombre, precio_unitario, cantidad)
      values (${idSinIva}, ${`${MARCA} Reportaje completo`}, 2000, 1)
    `;

    return { categoriaId: categoria.id, sinIva, conIva, calla, idSinIva };
  });
}

test.afterAll(async () => {
  if (!cadena) return;
  await conBase(async (sql) => {
    await sql`
      delete from public.servicios
       where proveedor_id in (select id from public.proveedores where nombre like ${`${MARCA}%`})
    `;
    await sql`delete from public.proveedores where nombre like ${`${MARCA}%`}`;
    await sql`delete from public.categorias_proveedor where nombre like ${`${MARCA}%`}`;
  });
});

test.describe("La comparativa de una categoría", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => seguirLaPista(page));

  /**
   * CAMINO FELIZ · tres presupuestos puestos en la misma base, y uno elegido.
   */
  test("pone las tres cifras en la misma base y el elegido pasa a contratado", async ({
    page,
  }) => {
    const sello = Date.now();
    const sembrado = await sembrar(sello);

    await entrar(page);

    // Se llega desde la categoría, que es donde se está cuando surge la duda.
    await page.goto(RUTA_PROVEEDORES);
    await page
      .getByRole("link", {
        name: copy.panel.proveedores.compararCategoria.replace(
          "{categoria}",
          `${MARCA} Categoría ${sello}`,
        ),
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_COMPARADOR}\\?categoria=`));

    // Los tres están, y con enlace a su ficha.
    for (const nombre of [sembrado.sinIva, sembrado.conIva, sembrado.calla]) {
      await expect(page.getByRole("link", { name: nombre })).toBeVisible();
    }

    const presupuestado = fila(page, copy.panel.proveedores.campoPresupuestado);
    const sin = fila(page, copy.panel.proveedores.sinIva);
    const con = fila(
      page,
      copy.panel.proveedores.conIva.replace("{iva}", String(PORCENTAJE_IVA)),
    );

    const euros = await comoSeEscribenLosImportes();

    // Las cifras tal cual se presupuestaron.
    await expect(presupuestado).toContainText(euros(2000));
    await expect(presupuestado).toContainText(euros(3630));
    await expect(presupuestado).toContainText(euros(1800));

    // Y puestas en la misma base: quien dio 2000 sin IVA pide 2420 con él, y
    // quien dio 3630 con IVA pide 3000 sin él. Comparadas a pelo, el primero
    // parecía el barato.
    await expect(sin).toContainText(euros(2000));
    await expect(sin).toContainText(euros(3000));
    await expect(con).toContainText(euros(2420));
    await expect(con).toContainText(euros(3630));

    /*
      LO QUE NO SE INVENTA. El tercero no dice si su cifra lleva IVA, así que su
      1800 no aparece en ninguna de las dos filas convertidas — ni como 1800
      ni como 2178 — y en su lugar sale el aviso pegado a la cifra.
    */
    await expect(presupuestado).toContainText(copy.panel.proveedores.ivaNoLoDice);
    await expect(sin).not.toContainText(euros(1800));
    await expect(con).not.toContainText(euros(2178));

    // Qué incluye, que es la columna que decide cuando dos cifras se parecen.
    await expect(fila(page, copy.panel.proveedores.queIncluye)).toContainText(
      `${MARCA} Reportaje completo`,
    );

    // Y se elige. El botón lleva el nombre dentro: con tres iguales en una
    // fila, «Marcar elegido» a secas no dice a quién.
    await page
      .getByRole("button", {
        name: copy.panel.proveedores.elegirA.replace("{nombre}", sembrado.sinIva),
      })
      .click();
    await esperarEstado(page, "elegido");

    const [elegido] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select estado from public.proveedores where id = ${sembrado.idSinIva}
      `,
    );
    expect(elegido.estado, "marcar elegido tiene que escribir en la base").toBe("contratado");

    await expect(page.getByText(copy.panel.proveedores.avisoElegido)).toBeVisible();
    // Y en la tabla ya no se ofrece elegirlo otra vez: sale contratado.
    await expect(fila(page, copy.panel.proveedores.elegirTitulo)).toContainText(
      copy.panel.proveedores.yaContratado,
    );
  });

  /**
   * CASO DE ERROR · una categoría que no existe se dice con palabras.
   *
   * Llega de dos sitios reales: un enlace guardado de una categoría que después
   * se borró, y una URL escrita a mano. `?categoria=inexistente` ni siquiera
   * tiene forma de identificador, así que además comprueba que no se le manda a
   * PostgreSQL para que conteste con un error de sintaxis.
   */
  test("una categoría que no existe lo dice claro", async ({ page }) => {
    await entrar(page);
    await page.goto(`${RUTA_COMPARADOR}?categoria=inexistente`);

    await expect(
      page.getByRole("heading", { name: copy.panel.proveedores.comparadorSinCategoriaTitulo }),
    ).toBeVisible();
    await expect(page.getByText(copy.panel.proveedores.comparadorSinCategoria)).toBeVisible();

    // Y con el camino de vuelta, que es lo único que se puede hacer desde aquí.
    await expect(page.getByRole("link", { name: copy.panel.proveedores.volver })).toBeVisible();
  });

  /**
   * CASO DE ERROR · elegir a un segundo de la categoría no se salta el aviso.
   *
   * Es el riesgo del ticket: un botón nuevo que escribiera «contratado» por su
   * cuenta sería una segunda puerta que se salta la confirmación de tener ya a
   * otro contratado — y precisamente en la pantalla donde uno está mirando a
   * tres candidatos, que es donde más fácil es contratar al segundo sin darse
   * cuenta.
   */
  test("elegir a un segundo con otro ya contratado pregunta antes", async ({ page }) => {
    const sello = Date.now();
    const sembrado = await sembrar(sello);

    // Uno ya cerrado, por SQL: lo que se prueba es el aviso, no volver a
    // recorrer el camino que ya cubre el test de arriba.
    await conBase(
      (sql) =>
        sql`update public.proveedores set estado = 'contratado' where id = ${sembrado.idSinIva}`,
    );

    const [segundo] = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.proveedores where nombre = ${sembrado.conIva}
      `,
    );

    await entrar(page);
    await page.goto(`${RUTA_COMPARADOR}?categoria=${sembrado.categoriaId}`);

    await page
      .getByRole("button", {
        name: copy.panel.proveedores.elegirA.replace("{nombre}", sembrado.conIva),
      })
      .click();

    // No decide: manda a la ficha, que es donde vive el aviso con nombres.
    await esperarEstado(page, "confirmar-contratado");
    await expect(page.getByText(copy.panel.proveedores.avisoConfirmarContratado)).toBeVisible();
    await expect(page.getByRole("link", { name: sembrado.sinIva })).toBeVisible();

    const [sinTocar] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select estado from public.proveedores where id = ${segundo.id}
      `,
    );
    expect(sinTocar.estado, "el aviso no se puede saltar desde el comparador").toBe(
      "investigando",
    );
  });
});
