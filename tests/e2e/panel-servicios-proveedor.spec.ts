import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL, RUTA_PROVEEDORES } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-74 · Servicios con precio por invitado
 *
 * LO QUE PROMETE EL TICKET ES QUE LA CUENTA SE MUEVE SOLA. «Catering: 8.600 €»
 * no es un dato útil: son 62 € por cabeza y un mínimo de 120 cubiertos, y el
 * número de verdad cambia cada vez que alguien confirma desde el móvil.
 *
 * Por eso el camino feliz no mira una pantalla y ya está: siembra un servicio
 * por invitado, apunta el importe que enseña, CONFIRMA DOS PERSONAS MÁS POR SQL
 * —como haría el RSVP— y comprueba que el importe ha subido exactamente dos
 * veces el precio unitario. Nadie ha pulsado «recalcular» porque no hay nada
 * que recalcular: el importe sale de `v_servicios_importe`.
 *
 * Y el caso borde es el que más dinero mueve: con un mínimo garantizado por
 * encima de la cuenta de hoy, el importe se queda en el mínimo y la pantalla
 * explica las dos cifras. Un panel que enseñara sólo la de hoy haría creer que
 * sobra un presupuesto que en realidad está comprometido.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Servicios";

/** Lo que cuesta cada cubierto en la prueba. Redondo, para leerlo sin calculadora. */
const PRECIO_POR_INVITADO = 10;

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

/** Las secciones, por su título y no por su posición. Igual que el resto del panel. */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/** El renglón de un servicio concreto dentro de la sección de servicios. */
function servicio(pagina: Page, nombre: string) {
  return seccion(pagina, copy.panel.proveedores.serviciosTitulo)
    .locator("li")
    .filter({ hasText: nombre });
}

/**
 * EL IMPORTE QUE ENSEÑA LA PANTALLA, COMO NÚMERO.
 *
 * Se lee y se convierte en lugar de comparar cadenas, y no es remilgo: «120,00»
 * es subcadena de «1.120,00», así que un `toContainText` puede dar por bueno un
 * importe que no es. Aquí se compara con `toBe`, que es lo que se quiere
 * afirmar de una cuenta.
 *
 * Se acota al párrafo del importe —el que lleva su rótulo— y no al renglón
 * entero, porque dentro también están el precio unitario y, si lo hay, la
 * explicación del mínimo.
 */
async function importeMostrado(renglon: Locator): Promise<number> {
  const texto = await renglon
    .locator("p")
    .filter({ hasText: copy.panel.proveedores.servicioImporte })
    .innerText();

  const encontradas = cifras(texto);
  expect(encontradas, `no se pudo leer un único importe en «${texto}»`).toHaveLength(1);
  return encontradas[0];
}

/**
 * Todos los importes que hay escritos en un texto, como números.
 *
 * SE EXTRAEN EN VEZ DE COMPONERLOS PARA COMPARAR CADENAS. El separador de
 * millar aparece a partir de mil, así que «1200,00» no casaría nunca con lo que
 * pinta la pantalla —«1.200,00»—, y el test pasaría o fallaría según cuánta
 * gente hubiera confirmada ese día. Leyendo los números y comparándolos como
 * números, la afirmación es sobre la cuenta y no sobre la tipografía.
 */
function cifras(texto: string): number[] {
  return [...texto.matchAll(/\d[\d.]*,\d{2}/g)].map((encontrada) =>
    Number(encontrada[0].replace(/\./g, "").replace(",", ".")),
  );
}

const SIN_DESTINO = "(ninguna acción ha redirigido: ¿llegó a enviarse el formulario?)";

/** El ayudante del molde: se afirma el destino que devolvió la acción, no la barra. */
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

async function crearProveedor(nombre: string): Promise<string> {
  return conBase(async (sql) => {
    const [categoria] = await sql<{ id: string }[]>`
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

/** Cuántos hay confirmados AHORA MISMO, según la misma vista que usa el panel. */
async function confirmados(): Promise<number> {
  const [fila] = await conBase(
    (sql) => sql<{ confirmados: string }[]>`
      select confirmados from public.v_estadisticas_invitados
    `,
  );
  return Number(fila.confirmados);
}

/**
 * Dos personas más que dicen que sí, exactamente como lo haría el RSVP: una
 * fila en `confirmaciones`, y el trigger de vigencia se encarga del resto.
 */
async function confirmarDosMas(sufijo: string) {
  await conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, huella_token)
      values (${`${MARCA} ${sufijo}`}, public.huella_token(${`tok-servicios-${sufijo}`}))
      returning id
    `;
    for (const nombre of ["(DES) Uno", "(DES) Dos"]) {
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos)
        values (${grupo.id}, ${nombre}, '(DES)')
      `;
    }
    await sql`
      insert into public.confirmaciones
        (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
      select i.id, 'confirmado', 'publico', false, false
        from public.invitados as i
       where i.grupo_id = ${grupo.id}
    `;
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
    // Los invitados y sus confirmaciones se van en cascada con el grupo. Dejar
    // gente confirmada de más falsearía el recuento de los demás specs.
    await sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%`}`;
  });
});

test.describe("Los servicios de un proveedor", () => {
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => seguirLaPista(page));

  /**
   * CAMINO FELIZ · confirmar dos personas más sube el importe dos cubiertos.
   */
  test("un servicio por invitado sube solo cuando confirma más gente", async ({ page }) => {
    const sello = Date.now();
    const nombre = `${MARCA} Menú adulto ${sello}`;
    const proveedorId = await crearProveedor(`${MARCA} Catering ${sello}`);

    await conBase(
      (sql) => sql`
        insert into public.servicios
          (proveedor_id, nombre, precio_unitario, cantidad, por_invitado, base_calculo)
        values (${proveedorId}, ${nombre}, ${PRECIO_POR_INVITADO}, 1, true, 'todos')
      `,
    );

    const antes = await confirmados();

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const renglon = servicio(page, nombre);
    await expect(renglon).toHaveCount(1);
    expect(await importeMostrado(renglon)).toBe(PRECIO_POR_INVITADO * antes);

    /*
      Y AHORA CONFIRMAN DOS MÁS, por SQL y como lo haría el RSVP. Nadie vuelve a
      tocar el panel: si el importe sube, es porque lo calcula la base.
    */
    await confirmarDosMas(`feliz-${sello}`);
    expect(await confirmados(), "las dos confirmaciones tenían que contar").toBe(antes + 2);

    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    expect(
      await importeMostrado(servicio(page, nombre)),
      "el importe tenía que subir exactamente dos cubiertos",
    ).toBe(PRECIO_POR_INVITADO * (antes + 2));
  });

  /**
   * CASO BORDE · con un mínimo garantizado por encima, manda el mínimo.
   *
   * Es la cláusula que firma todo catering —«120 cubiertos mínimo»— y la que
   * más dinero mueve del ticket: hasta que confirme esa gente, lo que se va a
   * pagar es el mínimo y no lo que sale de contar. Y la pantalla tiene que
   * explicar las DOS cifras, porque la diferencia entre ellas es exactamente lo
   * que se está pagando de más y es lo que hace llamar al catering.
   */
  test("el mínimo garantizado manda, y se explica con las dos cifras", async ({ page }) => {
    const sello = Date.now();
    const nombre = `${MARCA} Con mínimo ${sello}`;
    const proveedorId = await crearProveedor(`${MARCA} Finca ${sello}`);

    const hoy = await confirmados();
    // Muy por encima de lo que haya podido confirmar cualquier otro spec: lo
    // que se prueba es que el mínimo gana, no una cifra concreta.
    const minimo = PRECIO_POR_INVITADO * (hoy + 500);

    await conBase(
      (sql) => sql`
        insert into public.servicios
          (proveedor_id, nombre, precio_unitario, cantidad, por_invitado,
           base_calculo, minimo_garantizado)
        values (${proveedorId}, ${nombre}, ${PRECIO_POR_INVITADO}, 1, true,
                'todos', ${minimo})
      `,
    );

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const renglon = servicio(page, nombre);

    // Lo que se va a pagar es el mínimo, no el resultado de contar cabezas.
    expect(await importeMostrado(renglon), "el mínimo del contrato manda").toBe(minimo);

    /*
      Y SE EXPLICA CON LAS DOS CIFRAS. La frase se localiza por su arranque
      —hasta el primer marcador— y después se leen los importes que lleva
      dentro: primero lo que saldría hoy, después lo que garantiza el contrato.
      Es el dato que hace llamar al catering, así que se afirma entero.
    */
    const explicacion = renglon
      .locator("p")
      .filter({ hasText: copy.panel.proveedores.servicioMinimoManda.split("{")[0].trim() });

    await expect(explicacion).toHaveCount(1);
    expect(cifras(await explicacion.innerText())).toEqual([PRECIO_POR_INVITADO * hoy, minimo]);
  });

  /**
   * CASO DE ERROR · un mínimo en un servicio que no es por invitado no entra.
   *
   * Los dos campos de «por invitado» están siempre en pantalla porque esto
   * funciona sin JavaScript. `servicios_minimo_solo_por_invitado` lo prohíbe en
   * la base, así que sin esta comprobación el formulario devolvería un error de
   * restricción que no dice nada — y tragárselo en silencio sería peor todavía:
   * borraría un número que alguien acaba de teclear.
   */
  test("un mínimo garantizado sin precio por invitado se rechaza con su porqué", async ({
    page,
  }) => {
    const sello = Date.now();
    const proveedorId = await crearProveedor(`${MARCA} Sin invitados ${sello}`);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const alta = seccion(page, copy.panel.proveedores.nuevoServicioTitulo);
    await alta
      .getByLabel(copy.panel.proveedores.campoServicioNombre, { exact: true })
      .fill(`${MARCA} Fotomatón ${sello}`);
    await alta
      .getByLabel(copy.panel.proveedores.campoPrecioUnitario, { exact: true })
      .fill("450");
    // El mínimo puesto y la casilla de «por invitado» sin marcar.
    await alta.getByLabel(copy.panel.proveedores.campoMinimo, { exact: true }).fill("300");
    await alta.getByRole("button", { name: copy.panel.proveedores.anadirServicio }).click();

    await esperarEstado(page, "servicio-minimo-suelto");
    await expect(
      page.getByText(copy.panel.proveedores.errorServicioMinimoSuelto),
    ).toBeVisible();

    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.servicios where proveedor_id = ${proveedorId}
      `,
    );
    expect(filas, "un rechazo no escribe nada en la base").toHaveLength(0);
  });

  /**
   * CAMINO FELIZ · el CRUD entero desde la pantalla, sin JavaScript de por medio.
   */
  test("un servicio se crea, se edita y se quita desde la ficha", async ({ page }) => {
    const sello = Date.now();
    const nombre = `${MARCA} Barra libre ${sello}`;
    const proveedorId = await crearProveedor(`${MARCA} Bar ${sello}`);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const alta = seccion(page, copy.panel.proveedores.nuevoServicioTitulo);
    await alta
      .getByLabel(copy.panel.proveedores.campoServicioNombre, { exact: true })
      .fill(nombre);
    // Con separador de millar y coma decimal: es como se escribe en castellano
    // y como se pega desde un presupuesto en PDF.
    await alta
      .getByLabel(copy.panel.proveedores.campoPrecioUnitario, { exact: true })
      .fill("1.250,50");
    await alta.getByRole("button", { name: copy.panel.proveedores.anadirServicio }).click();
    await esperarEstado(page, "servicio-creado");

    const [creado] = await conBase(
      (sql) => sql<{ id: string; precio_unitario: string; por_invitado: boolean }[]>`
        select id, precio_unitario, por_invitado
          from public.servicios
         where proveedor_id = ${proveedorId} and nombre = ${nombre}
      `,
    );
    expect(creado, "el servicio tenía que estar en la base").toBeDefined();
    expect(Number(creado.precio_unitario)).toBe(1250.5);
    expect(creado.por_invitado).toBe(false);

    /*
      EDITAR A «POR INVITADO» CON BASE «NIÑOS», que es como se modela el menú
      infantil: otro servicio con su propia tarifa, no un descuento del de
      adultos. Sin `por_invitado`, `servicios_base_solo_por_invitado` rechazaría
      esa base — y ésa es justo la coherencia que resuelve la acción.
    */
    const renglon = servicio(page, nombre);
    await renglon.getByLabel(copy.panel.proveedores.campoPorInvitado, { exact: true }).check();
    await renglon
      .getByLabel(copy.panel.proveedores.campoBaseCalculo, { exact: true })
      .selectOption({ label: copy.panel.proveedores.basesServicio.ninos });
    await renglon.getByLabel(copy.panel.proveedores.campoMinimo, { exact: true }).fill("500");
    await renglon.getByRole("button", { name: copy.panel.proveedores.guardarServicio }).click();
    await esperarEstado(page, "servicio-editado");

    const [editado] = await conBase(
      (sql) => sql<
        { por_invitado: boolean; base_calculo: string; minimo_garantizado: string }[]
      >`
        select por_invitado, base_calculo::text as base_calculo, minimo_garantizado
          from public.servicios where id = ${creado.id}
      `,
    );
    expect(editado.por_invitado).toBe(true);
    expect(editado.base_calculo).toBe("ninos");
    expect(Number(editado.minimo_garantizado)).toBe(500);

    // Y quitarlo lo quita, sin preguntar: un servicio es una línea del desglose
    // que se vuelve a teclear en quince segundos, no un contrato firmado.
    await servicio(page, nombre)
      .getByRole("button", {
        name: copy.panel.proveedores.borrarServicioDe.replace("{nombre}", nombre),
      })
      .click();
    await esperarEstado(page, "servicio-borrado");

    const restantes = await conBase(
      (sql) => sql<{ id: string }[]>`select id from public.servicios where id = ${creado.id}`,
    );
    expect(restantes).toHaveLength(0);
  });
});
