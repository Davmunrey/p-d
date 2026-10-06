import { expect, test, type Page } from "./utiles/origen-propio";
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

async function subir(pagina: Page, contenido: string | Buffer, nombre = "invitados.csv") {
  await pagina.getByLabel(copy.panel.importar.fichero).setInputFiles({
    name: nombre,
    mimeType: "text/csv",
    buffer: typeof contenido === "string" ? Buffer.from(contenido, "utf8") : contenido,
  });
  await pagina.getByRole("button", { name: copy.panel.importar.analizar }).click();
}

/** Una invitación dada de alta por la base, con su gente, como si fuera de antes. */
async function crearInvitacion(
  nombre: string,
  lado: "novia" | "novio" | "ambos",
  gente: { nombre: string; apellidos: string | null }[] = [],
) {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
      values (${nombre}, ${lado}::public.lado_invitacion,
              array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
              public.huella_token(${`desarrollo-importar-${nombre}-000000`}))
      returning id
    `;
    for (const persona of gente) {
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        values (${grupo.id}, ${persona.nombre}, ${persona.apellidos}, false)
      `;
    }
  } finally {
    await sql.end();
  }
}

/** Una fila de errores por su número, tal y como la pinta la pantalla. */
function errorEnFila(pagina: Page, linea: number) {
  return pagina
    .getByRole("listitem")
    .filter({ hasText: copy.panel.importar.errorLinea.replace("{linea}", String(linea)) });
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  if (!cadena) return;
  const sql = postgres(cadena, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%`}`;
  } finally {
    await sql.end();
  }
});

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

    await expect(
      page.getByRole("heading", { name: copy.panel.importar.erroresTituloUna }),
    ).toBeVisible();
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

    await expect(
      page.getByRole("heading", { name: copy.panel.importar.erroresTituloUna }),
    ).toBeVisible();
    await expect(botonImportar(page)).toHaveCount(0);

    // Y sigue habiendo una, no dos.
    expect(await cuantasPersonas(nombre)).toBe(1);
  });

  /**
   * CASO DE ERROR · Tras una confirmación fallida, analizar otro fichero SIN
   * recargar tiene que enseñar el fichero nuevo.
   *
   * Antes la pantalla se quedaba con las filas y los errores del intento
   * anterior: el análisis nuevo se hacía en el servidor y se tiraba en el
   * navegador, no había botón de importar y nada decía que hubiera que
   * recargar. Se provoca el fallo dando de alta a la persona entre la previa y
   * el botón, que es el caso real: la otra familia importando su parte.
   */
  test("tras un fallo al confirmar, analizar otro fichero sin recargar enseña el nuevo", async ({
    page,
  }) => {
    const sello = Date.now();
    const repetida = `(DES) Colada ${sello}`;
    const nueva = `(DES) Limpia ${sello}`;
    const csvA = ["Grupo;Nombre;Apellidos", `${MARCA} carrera ${sello};${repetida};Pérez`].join(
      "\n",
    );
    const csvB = ["Grupo;Nombre;Apellidos", `${MARCA} carrera ${sello};${nueva};López`].join(
      "\n",
    );

    // La previa de A sale limpia.
    await subir(page, csvA);
    await expect(botonImportar(page)).toBeVisible();

    // Entre la previa y el botón, alguien da de alta a esa persona.
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      const [grupo] = await sql<{ id: string }[]>`
        insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
        values (${`${MARCA} carrera ${sello}`}, 'ambos',
                array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
                public.huella_token(${`desarrollo-importar-${sello}-000000`}))
        returning id
      `;
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        values (${grupo.id}, ${repetida}, 'Pérez', false)
      `;
    } finally {
      await sql.end();
    }

    // Confirmar falla: la revalidación la detecta y no importa nada.
    await botonImportar(page).click();
    await expect(
      page.getByRole("heading", { name: copy.panel.importar.erroresTituloUna }),
    ).toBeVisible();
    await expect(botonImportar(page)).toHaveCount(0);

    // Y AHORA, SIN RECARGAR, otro fichero: tiene que verse ÉSTE.
    await subir(page, csvB);
    await expect(page.getByText(nueva)).toBeVisible();
    await expect(page.getByText(repetida)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: copy.panel.importar.erroresTituloUna }),
    ).toHaveCount(0);
    await expect(botonImportar(page)).toBeVisible();

    await botonImportar(page).click();
    await expect(page).toHaveURL(/estado=importados/);
    expect(await cuantasPersonas(nueva)).toBe(1);
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

  /**
   * LA PLANTILLA QUE OFRECE LA PANTALLA SE PUEDE SUBIR TAL CUAL.
   *
   * Su fila de muestra decía «La novia» en el lado, que es como lo escribe la
   * pantalla, y el importador sólo entendía «novia»: subirla sin tocarla daba
   * «Fila 2 · «La novia» no es un lado» y ningún botón de importar. No se
   * confirma: la muestra no lleva la marca de los datos de prueba.
   */
  test("la plantilla descargada se analiza sin un solo error", async ({ page }) => {
    const respuesta = await page.request.get(`${RUTA_INVITADOS}/importar/plantilla`);
    const bytes = await respuesta.body();

    await page.getByLabel(copy.panel.importar.fichero).setInputFiles({
      name: "plantilla.csv",
      mimeType: "text/csv",
      buffer: bytes,
    });
    await page.getByRole("button", { name: copy.panel.importar.analizar }).click();

    await expect(
      page.getByRole("heading", { name: copy.panel.importar.previaTitulo }),
    ).toBeVisible();
    await expect(page.getByText(copy.panel.importar.muestraNombre)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: copy.panel.importar.erroresTituloUna }),
    ).toHaveCount(0);
    await expect(botonImportar(page)).toBeVisible();
  });

  /**
   * UNA INVITACIÓN ESCRITA SIN TILDES ES LA MISMA INVITACIÓN.
   *
   * La vista previa comparaba sin acentos y la base con ellos: con «Familia
   * Pérez» ya dada de alta, «Familia Perez;Ana» salía como duplicado —bien— y
   * «Familia Perez;Marta» acababa en una SEGUNDA invitación, con su propio
   * enlace, separada del resto de su familia.
   */
  test("sin tildes se suma a la invitación que ya existe, y caza al repetido", async ({
    page,
  }) => {
    const sello = Date.now();
    const conTilde = `${MARCA} Familia Pérez ${sello}`;
    const sinTilde = `${MARCA} familia perez ${sello}`;
    const ana = `(DES) Ana ${sello}`;
    const marta = `(DES) Marta ${sello}`;

    await subir(page, ["Grupo;Nombre", `${conTilde};${ana}`].join("\n"));
    await botonImportar(page).click();
    await expect(page).toHaveURL(/estado=importados/);

    // CAMINO FELIZ · Marta, escrita sin tildes, entra en la invitación de Ana.
    await page.goto(`${RUTA_INVITADOS}/importar`);
    await subir(page, ["Grupo;Nombre", `${sinTilde};${marta}`].join("\n"));
    const filaMarta = page.locator("tr").filter({ hasText: marta });
    await expect(filaMarta).toBeVisible();
    await expect(
      filaMarta,
      "la vista previa no puede anunciar una invitación nueva que no lo es",
    ).not.toContainText(copy.panel.importar.grupoNuevo);
    await botonImportar(page).click();
    await expect(page).toHaveURL(/estado=importados/);

    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      const grupos = await sql<{ grupo_id: string }[]>`
        select distinct grupo_id from public.invitados where nombre in (${ana}, ${marta})
      `;
      expect(grupos, "Ana y Marta comparten invitación, y por tanto enlace").toHaveLength(1);
    } finally {
      await sql.end();
    }

    // CASO DE ERROR · Ana otra vez, sin tildes y en mayúsculas: es la misma.
    await page.goto(`${RUTA_INVITADOS}/importar`);
    await subir(page, ["Grupo;Nombre", `${sinTilde.toUpperCase()};${ana}`].join("\n"));
    await expect(
      page.getByRole("heading", { name: copy.panel.importar.erroresTituloUna }),
    ).toBeVisible();
    await expect(botonImportar(page)).toHaveCount(0);
    expect(await cuantasPersonas(ana)).toBe(1);
  });
});

test.describe("Importar invitados con el criterio de la base", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await page.goto(`${RUTA_INVITADOS}/importar`);
  });

  /**
   * LA VISTA PREVIA LE PREGUNTA A LA BASE QUÉ ES «LO MISMO».
   *
   * Imitaba su criterio en JavaScript y acertaba con las tildes, no con lo
   * demás de `unaccent`: daba «Familia Collell» por la «Família Col·lell» que
   * ya existía —y la base creaba otra invitación— y daba «D’Angelo», con el
   * apóstrofo del móvil, por alguien distinto de «D'Angelo» —y la base
   * rechazaba la importación entera sin decir por qué—.
   */
  test("«Col·lell» no es «Collell», y el apóstrofo del móvil es el de siempre", async ({
    page,
  }) => {
    const sello = Date.now();
    const catalana = `${MARCA} Família Col·lell ${sello}`;
    const luca = `(DES) Luca ${sello}`;
    const jordi = `(DES) Jordi ${sello}`;
    await crearInvitacion(catalana, "ambos", [{ nombre: luca, apellidos: "D'Angelo" }]);

    await subir(
      page,
      [
        "Grupo;Nombre;Apellidos",
        `${MARCA} Familia Collell ${sello};${jordi};`,
        `${catalana};${luca};D’Angelo`,
      ].join("\n"),
    );

    // Para la base, sin el punto volado es otra invitación: así lo dice la fila.
    await expect(page.locator("tr").filter({ hasText: jordi })).toContainText(
      copy.panel.importar.grupoNuevo,
    );
    // Y Luca ya está, se escriba el apóstrofo como se escriba.
    await expect(errorEnFila(page, 3)).toContainText(luca);
    await expect(botonImportar(page)).toHaveCount(0);
  });

  /**
   * EL LADO ES DE LA INVITACIÓN. La vista previa enseñaba el lado de cada fila
   * y la base guardaba el del grupo: Paco salía «El novio» en pantalla y
   * entraba en una invitación de la novia sin que nadie se enterase.
   */
  test("una fila no cambia el lado de su invitación, y sin lado lo hereda", async ({
    page,
  }) => {
    const sello = Date.now();
    const carmona = `${MARCA} Carmona ${sello}`;
    const rocio = `(DES) Rocío ${sello}`;
    await crearInvitacion(carmona, "novia");

    // CASO DE ERROR · otro lado en una invitación que ya tiene el suyo.
    await subir(
      page,
      [
        "Grupo;Nombre;Lado",
        `${carmona};${rocio};`,
        `${carmona};(DES) Paco ${sello};El novio`,
      ].join("\n"),
    );
    await expect(errorEnFila(page, 3)).toContainText(copy.panel.invitados.lados.novia);
    await expect(errorEnFila(page, 3)).toContainText("El novio");
    await expect(botonImportar(page)).toHaveCount(0);

    // CAMINO FELIZ · sin lado, Rocío entra con el de su invitación.
    await subir(page, ["Grupo;Nombre;Lado", `${carmona};${rocio};`].join("\n"));
    await expect(page.locator("tr").filter({ hasText: rocio })).toContainText(
      copy.panel.invitados.lados.novia,
    );
    await botonImportar(page).click();
    await expect(page).toHaveURL(/estado=importados/);
    expect(await cuantasPersonas(rocio)).toBe(1);
  });

  /**
   * EL RESUMEN CUENTA COMO LA BASE, Y SE ANUNCIA. «3 personas en 1
   * invitaciones» contaba por el nombre en minúsculas, y el resultado aparecía
   * debajo sin que un lector de pantalla dijera nada.
   */
  test("una familia de tres es una invitación, y el resumen se anuncia", async ({ page }) => {
    const sello = Date.now();
    const familia = `${MARCA} Gorroño ${sello}`;
    await subir(
      page,
      [
        "Grupo;Nombre",
        `${familia};(DES) Uno ${sello}`,
        `${familia.toUpperCase()};(DES) Dos ${sello}`,
        `${familia.replace("ñ", "n")};(DES) Tres ${sello}`,
      ].join("\n"),
    );

    const resumen = copy.panel.importar.previaResumenUnaInvitacion.replace("{personas}", "3");
    const previa = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: copy.panel.importar.previaTitulo }) });
    await expect(previa.getByText(resumen, { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: resumen })).toHaveCount(1);
  });

  /**
   * CASOS DE ERROR · LO QUE NO SE PUEDE IMPORTAR SE DICE, Y DÓNDE.
   */
  test("una hoja sin exportar, un CSV sin filas y una fila en blanco en medio", async ({
    page,
  }) => {
    // Un .xlsx tal cual: empieza por la firma de un ZIP.
    await subir(
      page,
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00]),
      "invitados.xlsx",
    );
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      copy.panel.importar.errorNoEsCsv,
    );
    await expect(
      page.getByText(copy.panel.importar.errorFaltanColumnas.split("{")[0]),
    ).toHaveCount(0);

    // La plantilla con la fila de muestra borrada: sólo la cabecera.
    await subir(page, "Grupo;Nombre;Apellidos;Lado;Niño\r\n;;;;\r\n");
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      copy.panel.importar.errorNadaQueImportar,
    );

    // Una fila en blanco separando familias: el error es de la fila 4 de la hoja.
    const sello = Date.now();
    await subir(
      page,
      [
        "Grupo;Nombre",
        `${MARCA} A ${sello};(DES) Ana ${sello}`,
        ";",
        `${MARCA} B ${sello};`,
      ].join("\n"),
    );
    await expect(errorEnFila(page, 4)).toContainText(copy.panel.importar.errorSinNombre);
  });
});
