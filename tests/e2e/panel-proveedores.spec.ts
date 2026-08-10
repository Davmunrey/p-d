import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL, RUTA_PROVEEDORES } from "../../src/config/constants";

/**
 * BODA-70 · Proveedores y sus categorías
 *
 * EL CASO DE ERROR ES EL QUE JUSTIFICA MEDIA PANTALLA: borrar un proveedor que
 * tiene gastos asociados. `partidas_presupuesto.proveedor_id` es
 * `on delete set null`, así que la base **no se niega**: el gasto se queda ahí,
 * sin proveedor, y dentro de tres meses nadie sabe de quién era esa factura.
 * El aviso previo es lo único que lo evita, y por eso se comprueba que el
 * primer envío NO borra y que el gasto sigue en su sitio.
 *
 * SE COMPRUEBA CONTRA LA BASE y no sólo contra la pantalla. Un panel que dice
 * «guardado» sin escribir pasaría cualquier test que mire el HTML — y con RLS
 * de por medio ese fallo es especialmente fácil: una escritura prohibida no da
 * error, devuelve cero filas.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión, y sin servidor de autenticación no hay pantalla que ver.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Proveedores";

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

/**
 * LAS SECCIONES SE LOCALIZAN POR SU TÍTULO Y NO POR SU POSICIÓN, Y LAS
 * ETIQUETAS SE EXIGEN EXACTAS.
 *
 * Lo segundo lo enseñó el CI: `getByLabel("Estado")` casa por subcadena, y
 * «Pre-supu-ESTADO» la contiene. El desplegable de fase y el campo de importe
 * salían los dos, y el test moría con un «resolved to 2 elements» que costaba
 * más leer que arreglar. Con `exact` no hay sorpresa: lo que se pasa es el
 * rótulo entero.
 *
 *
 * «Teléfono» y «Nombre» son la etiqueta correcta en tres formularios distintos
 * de esta pantalla —el proveedor, su gente, la categoría— y eso está bien: son
 * teléfonos y son nombres. Lo que no puede hacer el test es resolver la
 * ambigüedad con `.first()`, porque entonces reordenar la pantalla cambia
 * silenciosamente qué campo se rellena y el test sigue en verde probando otra
 * cosa. Con el título por delante, mover una sección no rompe nada y renombrar
 * su título rompe aquí, que es donde se quiere.
 */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/** La primera categoría del desplegable, sea cual sea el estado de la base. */
async function primeraCategoria(pagina: Page): Promise<string> {
  const opcion = seccion(pagina, copy.panel.proveedores.nuevoTitulo)
    .getByLabel(copy.panel.proveedores.campoCategoria, { exact: true })
    .locator("option")
    .first();
  return (await opcion.textContent())?.trim() ?? "";
}

test.describe("El módulo de proveedores", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /**
   * CAMINO FELIZ · alta, edición, contacto y búsqueda con acentos.
   */
  test("se da de alta, se edita, y aparece en su categoría", async ({ page }) => {
    const nombre = `${MARCA} Fotógrafo ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_PROVEEDORES);

    const categoria = await primeraCategoria(page);
    const alta = seccion(page, copy.panel.proveedores.nuevoTitulo);

    await alta.getByLabel(copy.panel.proveedores.campoNombre, { exact: true }).fill(nombre);
    await alta
      .getByLabel(copy.panel.proveedores.campoCategoria, { exact: true })
      .selectOption({ label: categoria });
    // Con separador de millar y coma decimal: es como se escribe en castellano
    // y como se pega desde un presupuesto en PDF.
    await alta
      .getByLabel(copy.panel.proveedores.campoPresupuestado, { exact: true })
      .fill("2.200,50");
    await alta.getByRole("button", { name: copy.panel.proveedores.crear }).click();

    // Se va a su ficha: quien acaba de darlo de alta sigue teniendo qué apuntar.
    await expect(page).toHaveURL(new RegExp(`${RUTA_PROVEEDORES}/[0-9a-f-]{36}`));
    await expect(page.getByRole("heading", { name: nombre })).toBeVisible();

    // El importe se ha guardado como número, no como el texto que se tecleó.
    const [guardado] = await conBase(
      (sql) => sql<{ id: string; importe_presupuestado: string }[]>`
        select id, importe_presupuestado from public.proveedores where nombre = ${nombre}
      `,
    );
    expect(Number(guardado.importe_presupuestado)).toBe(2200.5);

    // Editar: se cierra el acuerdo y se apunta el teléfono.
    const edicion = seccion(page, copy.panel.proveedores.editarTitulo);
    await edicion
      .getByLabel(copy.panel.proveedores.campoAcordado, { exact: true })
      .fill("2100");
    await edicion
      .getByLabel(copy.panel.proveedores.campoTelefono, { exact: true })
      .fill("+34 600 111 222");
    await edicion.getByRole("button", { name: copy.panel.proveedores.guardar }).click();
    await expect(page.getByText(copy.panel.proveedores.avisoEditado)).toBeVisible();

    const [editado] = await conBase(
      (sql) => sql<{ importe_acordado: string; telefono: string }[]>`
        select importe_acordado, telefono from public.proveedores where id = ${guardado.id}
      `,
    );
    expect(Number(editado.importe_acordado)).toBe(2100);
    expect(editado.telefono).toBe("+34 600 111 222");

    // Un segundo contacto: el del día de la boda, que no es el comercial.
    const gente = seccion(page, copy.panel.proveedores.contactosTitulo);
    await gente
      .getByLabel(copy.panel.proveedores.campoNombreContacto, { exact: true })
      .fill("(DES) Jefe de sala");
    await gente
      .getByLabel(copy.panel.proveedores.campoTelefono, { exact: true })
      .fill("+34 600 333 444");
    await gente.getByLabel(copy.panel.proveedores.campoEsDelDia, { exact: true }).check();
    await gente.getByRole("button", { name: copy.panel.proveedores.anadirContacto }).click();

    await expect(page.getByText("(DES) Jefe de sala")).toBeVisible();
    // El distintivo lleva texto y no sólo color: es lo que lee un lector de
    // pantalla y lo que se ve con el sol de junio.
    await expect(
      gente.getByText(copy.panel.proveedores.esDelDia, { exact: true }),
    ).toBeVisible();

    // Y el teléfono es un enlace `tel:`, para llamar de un toque desde el móvil.
    await expect(page.getByRole("link", { name: "+34 600 333 444" })).toHaveAttribute(
      "href",
      "tel:+34600333444",
    );

    // La búsqueda aguanta acentos: «fotografo» tiene que encontrar «Fotógrafo».
    await page.goto(RUTA_PROVEEDORES);
    await page.getByLabel(copy.panel.proveedores.buscar, { exact: true }).fill("fotografo");
    await page.getByRole("button", { name: copy.panel.proveedores.buscar }).click();
    /*
      Por texto y no por expresión regular: el nombre lleva «(DES)» dentro, y
      `new RegExp(nombre)` convierte esos paréntesis en un grupo de captura —la
      expresión pasaría a buscar «DES E2E…» sin paréntesis y no encontraría
      nada. Con una cadena, Playwright busca subcadena y ya está.
    */
    await expect(page.getByRole("link", { name: nombre })).toBeVisible();
  });

  /**
   * CASO DE ERROR · Borrar un proveedor con gastos avisa antes, y no borra.
   */
  test("borrar un proveedor con gastos avisa antes de hacerlo", async ({ page }) => {
    const nombre = `${MARCA} Con gastos ${Date.now()}`;

    // El escenario se monta por SQL: lo que se prueba es el aviso, no volver a
    // recorrer el alta que ya cubre el test de arriba.
    const { proveedorId, partidaId } = await conBase(async (sql) => {
      const [categoria] = await sql<{ id: string }[]>`
        select id from public.categorias_proveedor order by orden, nombre limit 1
      `;
      const [proveedor] = await sql<{ id: string }[]>`
        insert into public.proveedores (categoria_id, nombre)
        values (${categoria.id}, ${nombre})
        returning id
      `;
      const [categoriaGasto] = await sql<{ id: string }[]>`
        insert into public.categorias_presupuesto (nombre, importe_previsto)
        values (${`${MARCA} Categoría ${Date.now()}`}, 1000)
        returning id
      `;
      const [partida] = await sql<{ id: string }[]>`
        insert into public.partidas_presupuesto
          (categoria_id, proveedor_id, concepto, importe_estimado)
        values (${categoriaGasto.id}, ${proveedor.id}, ${`${MARCA} Señal`}, 500)
        returning id
      `;
      return { proveedorId: proveedor.id, partidaId: partida.id };
    });

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    await page.getByRole("button", { name: copy.panel.proveedores.borrar }).click();

    // No ha borrado: pregunta, y dice exactamente qué se quedaría huérfano.
    await expect(page.getByText(copy.panel.proveedores.avisoConfirmarBorrado)).toBeVisible();
    await expect(page.getByText(`${MARCA} Señal`)).toBeVisible();

    const [sigue] = await conBase(
      (sql) =>
        sql<{ id: string }[]>`select id from public.proveedores where id = ${proveedorId}`,
    );
    expect(sigue?.id, "el primer envío no puede borrar nada").toBe(proveedorId);

    // Ahora sí, confirmando. El gasto sobrevive: es contabilidad.
    await page.getByRole("button", { name: copy.panel.proveedores.confirmarBorrado }).click();
    await expect(page.getByText(copy.panel.proveedores.avisoBorrado)).toBeVisible();

    const restantes = await conBase(
      (sql) =>
        sql<{ id: string }[]>`select id from public.proveedores where id = ${proveedorId}`,
    );
    expect(restantes).toHaveLength(0);

    const [gasto] = await conBase(
      (sql) => sql<{ proveedor_id: string | null }[]>`
        select proveedor_id from public.partidas_presupuesto where id = ${partidaId}
      `,
    );
    expect(gasto, "el gasto ocurrió y sigue contando").toBeDefined();
    expect(gasto.proveedor_id).toBeNull();
  });

  /**
   * CASO DE ERROR · Una categoría con proveedores no ofrece borrarse.
   */
  test("una categoría con proveedores no se puede borrar", async ({ page }) => {
    const nombreCategoria = `${MARCA} Categoría ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_PROVEEDORES);

    const nueva = seccion(page, copy.panel.proveedores.nuevaCategoriaTitulo);
    await nueva
      .getByLabel(copy.panel.proveedores.campoNombreCategoria, { exact: true })
      .fill(nombreCategoria);
    await nueva.getByRole("button", { name: copy.panel.proveedores.crearCategoria }).click();
    await expect(page.getByText(copy.panel.proveedores.avisoCategoriaCreada)).toBeVisible();

    const suya = seccion(page, nombreCategoria);

    // Vacía: se puede borrar.
    await expect(
      suya.getByRole("button", { name: copy.panel.proveedores.borrarCategoria }),
    ).toBeVisible();

    // Con alguien dentro, el botón desaparece: la base lo impediría igualmente,
    // y ofrecer un botón que sólo puede fallar obliga a probarlo para saberlo.
    await conBase(async (sql) => {
      const [categoria] = await sql<{ id: string }[]>`
        select id from public.categorias_proveedor where nombre = ${nombreCategoria}
      `;
      await sql`
        insert into public.proveedores (categoria_id, nombre)
        values (${categoria.id}, ${`${MARCA} Ocupante`})
      `;
    });

    await page.reload();
    await expect(
      suya.getByRole("button", { name: copy.panel.proveedores.borrarCategoria }),
    ).toHaveCount(0);
  });
});

/**
 * BODA-71 · El embudo, de investigando a contratado
 *
 * LAS DOS GUARDAS SON LO QUE JUSTIFICA EL TICKET, y las dos se comprueban
 * contra la base y no contra la pantalla:
 *
 *  - Descartar sin decir por qué no escribe nada. Dentro de seis meses nadie
 *    se acuerda, y alguien vuelve a escribir al mismo proveedor para recibir
 *    la misma respuesta.
 *  - Contratar a un segundo de la misma categoría pregunta antes. No se
 *    prohíbe —hay bodas con dos fotógrafos— pero lo normal es que falte
 *    descartar al otro, y a partir de ahí el resumen de «qué falta por cerrar»
 *    miente en la dirección tranquilizadora.
 */
test.describe("El embudo del proveedor", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /** Un proveedor recién creado, en la categoría que se diga. */
  async function crearProveedor(nombre: string, categoriaId?: string): Promise<string> {
    return conBase(async (sql) => {
      const [categoria] = categoriaId
        ? [{ id: categoriaId }]
        : await sql<{ id: string }[]>`
            select id from public.categorias_proveedor order by orden, nombre limit 1
          `;
      const [proveedor] = await sql<{ id: string }[]>`
        insert into public.proveedores (categoria_id, nombre)
        values (${categoria.id}, ${nombre})
        returning id
      `;
      return proveedor.id;
    });
  }

  /**
   * CAMINO FELIZ · avanzar de fase persiste, y descartar guarda el porqué.
   */
  test("el estado avanza, persiste, y al descartar se guarda por qué", async ({ page }) => {
    const id = await crearProveedor(`${MARCA} Embudo ${Date.now()}`);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${id}`);

    const fase = seccion(page, copy.panel.proveedores.estadoTitulo);

    // Una fase nueva de las que traía este ticket: sin ella, «le llamé» y «le
    // pedí presupuesto» se veían igual.
    await fase
      .getByLabel(copy.panel.proveedores.campoEstado, { exact: true })
      .selectOption({ label: copy.panel.proveedores.estados.presupuesto_pedido });
    await fase.getByRole("button", { name: copy.panel.proveedores.cambiarEstado }).click();
    await expect(page.getByText(copy.panel.proveedores.avisoEstadoCambiado)).toBeVisible();

    // Persiste: se comprueba recargando, no fiándose de lo que quedó pintado.
    await page.reload();
    await expect(
      seccion(page, copy.panel.proveedores.estadoTitulo).getByLabel(
        copy.panel.proveedores.campoEstado,
        { exact: true },
      ),
    ).toHaveValue("presupuesto_pedido");

    // Descartar, ahora sí con motivo.
    const motivo = "(DES) No tenía libre la fecha";
    const faseTrasRecarga = seccion(page, copy.panel.proveedores.estadoTitulo);
    await faseTrasRecarga
      .getByLabel(copy.panel.proveedores.campoEstado, { exact: true })
      .selectOption({ label: copy.panel.proveedores.estados.descartado });
    await faseTrasRecarga
      .getByLabel(copy.panel.proveedores.campoMotivoDescarte, { exact: true })
      .fill(motivo);
    await faseTrasRecarga
      .getByRole("button", { name: copy.panel.proveedores.cambiarEstado })
      .click();

    await expect(page.getByText(motivo)).toBeVisible();

    const [descartado] = await conBase(
      (sql) => sql<{ estado: string; motivo_descarte: string }[]>`
        select estado, motivo_descarte from public.proveedores where id = ${id}
      `,
    );
    expect(descartado.estado).toBe("descartado");
    expect(descartado.motivo_descarte).toBe(motivo);
  });

  /**
   * CASO DE ERROR · Descartar sin motivo no escribe nada.
   */
  test("descartar sin decir por qué no cambia el estado", async ({ page }) => {
    const id = await crearProveedor(`${MARCA} Sin motivo ${Date.now()}`);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${id}`);

    const fase = seccion(page, copy.panel.proveedores.estadoTitulo);
    await fase
      .getByLabel(copy.panel.proveedores.campoEstado, { exact: true })
      .selectOption({ label: copy.panel.proveedores.estados.descartado });
    await fase.getByRole("button", { name: copy.panel.proveedores.cambiarEstado }).click();

    await expect(page.getByText(copy.panel.proveedores.errorDescarteSinMotivo)).toBeVisible();

    const [sigue] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select estado from public.proveedores where id = ${id}
      `,
    );
    expect(sigue.estado, "sin motivo no se descarta").toBe("investigando");
  });

  /**
   * CASO DE ERROR · Contratar a un segundo de la categoría pide confirmación.
   */
  test("contratar a un segundo de la misma categoría pregunta antes", async ({ page }) => {
    const sello = Date.now();
    const categoriaId = await conBase(async (sql) => {
      const [categoria] = await sql<{ id: string }[]>`
        insert into public.categorias_proveedor (nombre, orden)
        values (${`${MARCA} Embudo ${sello}`}, 50)
        returning id
      `;
      return categoria.id;
    });

    const primero = await crearProveedor(`${MARCA} Ya contratado ${sello}`, categoriaId);
    await conBase(
      (sql) => sql`update public.proveedores set estado = 'contratado' where id = ${primero}`,
    );
    const segundo = await crearProveedor(`${MARCA} El segundo ${sello}`, categoriaId);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${segundo}`);

    const fase = seccion(page, copy.panel.proveedores.estadoTitulo);
    await fase
      .getByLabel(copy.panel.proveedores.campoEstado, { exact: true })
      .selectOption({ label: copy.panel.proveedores.estados.contratado });
    await fase.getByRole("button", { name: copy.panel.proveedores.cambiarEstado }).click();

    // Pregunta, y dice a quién: «ya hay uno» sin nombre obliga a ir a buscarlo.
    await expect(page.getByText(copy.panel.proveedores.avisoConfirmarContratado)).toBeVisible();
    await expect(
      page.getByRole("link", { name: `${MARCA} Ya contratado ${sello}` }),
    ).toBeVisible();

    const [sinTocar] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select estado from public.proveedores where id = ${segundo}
      `,
    );
    expect(sinTocar.estado, "el primer envío no puede contratar").toBe("investigando");

    // Confirmando sí: hay bodas con dos fotógrafos.
    await page
      .getByRole("button", { name: copy.panel.proveedores.confirmarContratado })
      .click();
    await expect(page.getByText(copy.panel.proveedores.avisoEstadoCambiado)).toBeVisible();

    const [contratado] = await conBase(
      (sql) => sql<{ estado: string }[]>`
        select estado from public.proveedores where id = ${segundo}
      `,
    );
    expect(contratado.estado).toBe("contratado");
  });

  /**
   * Y lo que contesta la pregunta de verdad: qué falta por cerrar.
   */
  test("el resumen dice qué categorías no tienen a nadie contratado", async ({ page }) => {
    const sello = Date.now();
    const nombreCategoria = `${MARCA} Sin cerrar ${sello}`;
    const categoriaId = await conBase(async (sql) => {
      const [categoria] = await sql<{ id: string }[]>`
        insert into public.categorias_proveedor (nombre, orden)
        values (${nombreCategoria}, 51)
        returning id
      `;
      return categoria.id;
    });

    await entrar(page);
    await page.goto(RUTA_PROVEEDORES);

    const resumen = seccion(page, copy.panel.proveedores.sinCerrarTitulo);
    const suya = resumen.locator("li").filter({ hasText: nombreCategoria });

    /*
      Recién creada y vacía: sale, y dice que ni siquiera se ha empezado. Se
      mira dentro de SU renglón y no en toda la sección: «sin empezar» lo dicen
      todas las categorías vacías, así que buscarlo suelto daría por buena la
      frase de otra.
    */
    await expect(suya).toHaveCount(1);
    await expect(suya).toContainText(copy.panel.proveedores.sinCerrarSinEmpezar);

    // Con alguien contratado dentro, deja de faltar.
    const proveedor = await crearProveedor(`${MARCA} Cierra ${sello}`, categoriaId);
    await conBase(
      (sql) => sql`update public.proveedores set estado = 'contratado' where id = ${proveedor}`,
    );

    /*
      Y deja de faltar. Se comprueba DENTRO del resumen: la categoría sigue
      existiendo más abajo, con su proveedor dentro, así que buscarla en toda
      la página encontraría esa otra y el test fallaría por lo contrario de lo
      que quiere comprobar.
    */
    await page.reload();
    await expect(
      seccion(page, copy.panel.proveedores.sinCerrarTitulo)
        .locator("li")
        .filter({ hasText: nombreCategoria }),
    ).toHaveCount(0);
  });
});
