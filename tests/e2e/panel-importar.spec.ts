import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_INVITADOS, RUTA_PANEL } from "../../src/config/constants";

/**
 * BODA-53 · Importar invitados desde CSV
 *
 * Los quince casos raros de un CSV —separadores, comillas, acentos rotos de
 * Excel— viven en `tests/unidad/importacion.test.ts`, que los prueba en
 * milisegundos. Aquí se prueba lo que sólo se puede probar con la base delante:
 * que la importación **escribe de verdad**, y que cuando una fila está mal no
 * escribe **nada**.
 *
 * Esa segunda parte es el criterio del ticket y el único que puede fallar en
 * silencio: una importación a medias deja la lista con gente dentro y gente
 * fuera, sin ninguna marca que distinga a quién faltó.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Importar";

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

/** Cuántas personas hay con ese nombre. La base es la que dice la verdad. */
async function cuantasPersonas(nombre: string): Promise<number> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [fila] = await sql<{ cuantas: number }[]>`
      select count(*)::int as cuantas from public.invitados where nombre = ${nombre}
    `;
    return fila.cuantas;
  } finally {
    await sql.end();
  }
}

/**
 * El botón de confirmar, EXACTO.
 *
 * Sin `exact`, «Importar» casa también con «Ver qué se va a importar», que
 * está en la misma pantalla: Playwright encuentra dos botones y se niega a
 * elegir. Peor todavía en las comprobaciones de que el botón NO está — sin
 * `exact` contarían uno y darían por bueno lo contrario de lo que preguntan.
 */
function botonImportar(pagina: Page) {
  return pagina.getByRole("button", { name: copy.panel.importar.confirmar, exact: true });
}

async function subir(pagina: Page, contenido: string) {
  await pagina.getByLabel(copy.panel.importar.fichero).setInputFiles({
    name: "invitados.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(contenido, "utf8"),
  });
  await pagina.getByRole("button", { name: copy.panel.importar.analizar }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("Importar invitados", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await page.goto(`${RUTA_INVITADOS}/importar`);
  });

  test("se llega desde la lista de invitaciones", async ({ page }) => {
    await page.goto(RUTA_INVITADOS);
    await page.getByRole("link", { name: copy.panel.importar.enlaceDesdeLista }).click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_INVITADOS}/importar`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.panel.importar.titulo,
    );
  });

  /**
   * EL CAMINO FELIZ. Un CSV con dos familias da de alta a las cuatro personas
   * en DOS invitaciones, no en cuatro: un CSV trae una fila por persona, y las
   * personas de una familia comparten invitación y enlace.
   */
  test("un CSV válido da de alta a todos, agrupados por invitación", async ({ page }) => {
    const sello = Date.now();
    const familia = `${MARCA} Zubeldía ${sello}`;
    const otra = `${MARCA} Gorroño ${sello}`;
    const nombre = `(DES) Ainhoa ${sello}`;

    await subir(
      page,
      [
        "Grupo;Nombre;Apellidos;Lado;Niño",
        `${familia};${nombre};Zubeldía;novia;no`,
        `${familia};(DES) Unai ${sello};Zubeldía;novia;sí`,
        `${otra};(DES) Uxue ${sello};Gorroño;novio;no`,
      ].join("\n"),
    );

    // Antes de escribir nada se enseña qué va a entrar. Es el criterio de la
    // vista previa: cuatro filas repartidas en dos invitaciones nuevas.
    await expect(
      page.getByRole("heading", { name: copy.panel.importar.previaTitulo }),
    ).toBeVisible();
    await expect(page.getByText(nombre)).toBeVisible();
    await expect(page.getByText(copy.panel.importar.grupoNuevo).first()).toBeVisible();

    // Y hasta aquí, nada dado de alta.
    expect(await cuantasPersonas(nombre)).toBe(0);

    await botonImportar(page).click();
    await expect(page).toHaveURL(/estado=importados/);

    expect(await cuantasPersonas(nombre)).toBe(1);

    // Dos invitaciones, no tres: la familia comparte la suya.
    await page.goto(`${RUTA_INVITADOS}?buscar=${encodeURIComponent(String(sello))}`);
    await expect(page.getByRole("link", { name: familia })).toContainText(
      copy.panel.invitados.personasCuenta.replace("{personas}", "2"),
    );
    await expect(page.getByRole("link", { name: otra })).toBeVisible();
  });

  /**
   * CASO DE ERROR · UNA FILA MAL Y NO ENTRA NINGUNA.
   *
   * Lo que se comprueba no es que salga el aviso: es que la persona de la fila
   * BUENA tampoco está en la base. Media importación es peor que ninguna,
   * porque no deja rastro de por dónde se quedó.
   */
  test("una fila mal señala su línea y no importa ninguna", async ({ page }) => {
    const sello = Date.now();
    const buena = `(DES) Buena ${sello}`;

    await subir(
      page,
      [
        "Grupo;Nombre;Apellidos",
        `${MARCA} ${sello};${buena};Primera`,
        // Sin grupo: es la línea 3 del fichero, contando la cabecera.
        `;(DES) Huérfana ${sello};Segunda`,
        `${MARCA} ${sello};(DES) Tercera ${sello};Tercera`,
      ].join("\n"),
    );

    await expect(page.getByText(copy.panel.importar.erroresTituloUna)).toBeVisible();
    await expect(
      page.getByText(copy.panel.importar.errorLinea.replace("{linea}", "3")),
    ).toBeVisible();
    await expect(page.getByText(copy.panel.importar.errorSinGrupo)).toBeVisible();

    // Y no hay forma de importar: el botón no está, no es que esté apagado.
    await expect(botonImportar(page)).toHaveCount(0);

    // Lo que de verdad importa: la fila buena TAMPOCO ha entrado.
    expect(await cuantasPersonas(buena)).toBe(0);
  });

  /**
   * CASO DE ERROR · Quien ya está no entra dos veces.
   *
   * Se importa una vez y se vuelve a subir el mismo fichero: la segunda tiene
   * que quedarse en la vista previa señalando el duplicado.
   */
  test("detecta a quien ya está dado de alta", async ({ page }) => {
    const sello = Date.now();
    const nombre = `(DES) Repetida ${sello}`;
    const csv = ["Grupo;Nombre;Apellidos", `${MARCA} repes ${sello};${nombre};Pérez`].join(
      "\n",
    );

    await subir(page, csv);
    await botonImportar(page).click();
    await expect(page).toHaveURL(/estado=importados/);
    expect(await cuantasPersonas(nombre)).toBe(1);

    await page.goto(`${RUTA_INVITADOS}/importar`);
    await subir(page, csv);

    await expect(page.getByText(copy.panel.importar.erroresTituloUna)).toBeVisible();
    await expect(botonImportar(page)).toHaveCount(0);

    // Y sigue habiendo una, no dos.
    expect(await cuantasPersonas(nombre)).toBe(1);
  });

  test("la plantilla se descarga con el BOM y los rótulos de la pantalla", async ({ page }) => {
    // `page.request` y no el fixture `request`: el fixture es un contexto de
    // red aparte y llegaría sin sesión, así que descargaría la pantalla de
    // acceso en lugar del fichero.
    const respuesta = await page.request.get(`${RUTA_INVITADOS}/importar/plantilla`);
    const bytes = await respuesta.body();

    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const texto = bytes.toString("utf8");
    expect(texto).toContain(copy.panel.importar.columna.grupo);
    // Con acento y ñ: si esto llega roto, el problema es la codificación.
    expect(texto).toContain(copy.panel.importar.muestraApellidos);
  });
});
