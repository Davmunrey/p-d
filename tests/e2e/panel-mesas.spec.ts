import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  PASO_PLANO_MESAS,
  RUTA_ACCESO,
  RUTA_MESAS,
  RUTA_MESAS_EXPORTAR,
  RUTA_PANEL,
} from "../../src/config/constants";
import { laPista, seguirLaPista } from "./utiles/rastro";

/**
 * BODA-83 (#59) y BODA-84 (#60) · El plano de la sala y el reparto
 *
 * LO QUE JUSTIFICA ESTE SPEC ES EL CASO DE ERROR: pasarse de la capacidad. La
 * base **no se niega** —la tabla admite a propósito que una mesa se pase,
 * porque durante el reparto se pasa todo el rato— así que el único sitio donde
 * ese tope existe es la acción de servidor. Un test que sólo mirase la pantalla
 * daría por bueno un panel que dice «guardado» y sienta a once personas en una
 * mesa de ocho, y eso se descubre el día de la boda contando sillas.
 *
 * POR ESO TODO SE COMPRUEBA CONTRA LA BASE y no sólo contra el HTML. Con RLS de
 * por medio el fallo es especialmente fácil: una escritura prohibida no da
 * error, devuelve cero filas.
 *
 * Sólo corre en el trabajo de CI que levanta el Supabase de verdad: el panel
 * necesita sesión, y sin servidor de autenticación no hay pantalla que ver.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Mesas";

/** El centro del lienzo, que es donde «Colocar en el plano» deja una mesa. */
const CENTRO = 5000;

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
 * LAS SECCIONES SE LOCALIZAN POR SU TÍTULO Y NO POR SU POSICIÓN.
 *
 * En esta pantalla hace además otro trabajo: «Nombre», «Capacidad» y «Mesa de…»
 * son la etiqueta correcta en tantos formularios como mesas haya, y eso está
 * bien —son nombres y son capacidades—. Lo que no puede hacer el test es
 * resolver la ambigüedad con `.first()`, porque entonces reordenar la pantalla
 * cambia en silencio qué mesa se está tocando y el test sigue en verde probando
 * otra cosa. Con el título por delante, mover una sección no rompe nada y
 * renombrar su título rompe aquí, que es donde se quiere.
 */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/** Interpola como `t()`: los rótulos con `{mesa}` dentro se escriben una vez. */
function conValores(plantilla: string, valores: Record<string, string | number>): string {
  return plantilla.replace(/\{(\w+)\}/g, (todo, clave: string) =>
    clave in valores ? String(valores[clave]) : todo,
  );
}

/* -------------------------------------------------------------------------- */
/*  A dónde dijo la acción que fuéramos                                       */
/* -------------------------------------------------------------------------- */

/**
 * EL FALLO INTERMITENTE #126 ES AFIRMAR LA URL DEL NAVEGADOR A PELO.
 *
 * Cada formulario de esta pantalla hace `POST` a una acción de servidor que
 * escribe y **redirige** con el resultado en la URL. Mirar la barra de
 * direcciones mete dos cosas en el mismo cronómetro —la escritura y que el
 * enrutador de cliente aplique la navegación— y en una máquina de CI cargada la
 * segunda a veces no llega a tiempo. El test falla entonces por algo que no es
 * lo que estaba probando.
 *
 * Lo que de verdad hay que afirmar es **el destino que devolvió la acción**, que
 * viaja en las cabeceras de esa misma respuesta: `location` por el camino sin
 * JavaScript y `x-action-redirect` por el de acción de servidor. Eso dice si la
 * acción hizo su trabajo, independientemente de lo rápido que vaya el navegador.
 *
 * Después se comprueba que la pestaña acabó ahí, con un `goto` de rescate si el
 * enrutador se quedó atrás: la pantalla tiene que estar en el sitio correcto
 * para poder leer el aviso, pero llegar tarde no es un fallo del módulo.
 *
 * Se guarda en un `WeakMap` porque cada test tiene su propia `page` y fuera de
 * CI corren en paralelo.
 */
const destinos = new WeakMap<Page, string[]>();

function anotarDestinos(pagina: Page): void {
  const vistos: string[] = [];
  destinos.set(pagina, vistos);

  pagina.on("response", (respuesta) => {
    if (respuesta.request().method() !== "POST") return;
    const cabeceras = respuesta.headers();
    const destino = cabeceras["location"] ?? cabeceras["x-action-redirect"];
    // `x-action-redirect` llega como `/ruta?estado=algo;push`: el modo sobra.
    if (destino) vistos.push(destino.split(";")[0]);
  });
}

/** Se olvida lo anterior antes de cada acción: un destino viejo la daría por buena. */
function olvidarDestinos(pagina: Page): void {
  destinos.get(pagina)?.splice(0);
}

function ultimoDestino(pagina: Page): string {
  const vistos = destinos.get(pagina);
  return vistos?.[vistos.length - 1] ?? "";
}

/** Pulsa un botón olvidando antes lo que devolvió la acción anterior. */
async function enviar(pagina: Page, boton: Locator): Promise<void> {
  olvidarDestinos(pagina);
  await boton.click();
}

async function esperarEstado(pagina: Page, esperado: string): Promise<void> {
  const patron = new RegExp(`estado=${esperado}(&|$)`);

  try {
    await expect.poll(() => ultimoDestino(pagina), { timeout: 30_000 }).toMatch(patron);
  } catch (fallo) {
    /*
      SI NO REDIRIGE, LO SIGUIENTE QUE HAY QUE SABER ES QUÉ SE VE. Una acción
      que lanza no cambia la URL: Next pinta el `error.tsx` del panel en el
      sitio. Visto sólo desde fuera, eso es indistinguible de «no ha pasado
      nada», y son dos cosas muy distintas.
    */
    const enPantalla = await pagina
      .locator("main")
      .innerText()
      .catch(() => "(no se pudo leer la pantalla)");
    throw new Error(
      `${(fallo as Error).message}\n\nLo que hizo la pestaña:\n${laPista(pagina)}` +
        `\n\nLa pantalla decía:\n${enPantalla.slice(0, 600)}`,
    );
  }

  // El destino era el correcto. Que la pestaña llegue es otra cosa, y si se
  // queda atrás se la lleva a mano en vez de tumbar el test por lentitud.
  try {
    await expect(pagina).toHaveURL(patron, { timeout: 10_000 });
  } catch {
    await pagina.goto(ultimoDestino(pagina));
    await expect(pagina).toHaveURL(patron);
  }
}

/* -------------------------------------------------------------------------- */
/*  El escenario, montado por SQL                                             */
/* -------------------------------------------------------------------------- */

/**
 * LO QUE HAY QUE BORRAR AL ACABAR, POR IDENTIFICADOR Y NO POR PREFIJO.
 *
 * Borrar todo lo que empiece por la marca es lo cómodo y es una carrera:
 * `fullyParallel` reparte los tests de este fichero entre varios procesos, y el
 * `afterAll` del primero en terminar se llevaría por delante los datos que otro
 * está usando en ese momento. Lo anotado aquí es de este proceso y de nadie más.
 */
const mesasCreadas: string[] = [];
const gruposCreados: string[] = [];

async function crearMesa(nombre: string, capacidad: number): Promise<string> {
  const id = await conBase(async (sql) => {
    const [mesa] = await sql<{ id: string }[]>`
      insert into public.mesas (nombre, capacidad)
      values (${nombre}, ${capacidad})
      returning id
    `;
    return mesa.id;
  });
  mesasCreadas.push(id);
  return id;
}

/**
 * Un grupo de invitación con su gente.
 *
 * `confirmado` decide si contestan que sí o si se quedan sin contestar, que son
 * las dos bolsas distintas de la pantalla. Se contesta insertando en
 * `confirmaciones` como haría el RSVP —el histórico es de sólo inserción y un
 * trigger deja vigente la última— en lugar de tocar nada a mano.
 */
async function crearGrupo(
  nombre: string,
  cuantos: number,
  confirmado: boolean,
): Promise<string> {
  const id = await conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, huella_token)
      values (${nombre}, public.huella_token(${`tok-${nombre}`}))
      returning id
    `;

    for (let numero = 1; numero <= cuantos; numero += 1) {
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos)
        values (${grupo.id}, ${`${MARCA} Comensal ${numero}`}, '(DES)')
      `;
    }

    if (confirmado) {
      await sql`
        insert into public.confirmaciones
          (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
        select i.id, 'confirmado', 'publico', false, false
          from public.invitados as i
         where i.grupo_id = ${grupo.id}
      `;
    }

    return grupo.id;
  });

  gruposCreados.push(id);
  return id;
}

async function cuantosSentados(mesaId: string): Promise<number> {
  const [fila] = await conBase(
    (sql) => sql<{ cuantos: string }[]>`
      select count(*) as cuantos from public.invitados where mesa_id = ${mesaId}
    `,
  );
  return Number(fila.cuantos);
}

test.describe("El plano de mesas y el reparto", () => {
  /*
    CADA PASO DE ESTA PANTALLA ES UN VIAJE COMPLETO: escribir en la base,
    redirigir, y repintar entera una página `force-dynamic` que lee mesas,
    invitados y alergias. En el trabajo de CI que levanta Supabase en Docker eso
    no cabe en el plazo por defecto, y el síntoma no es un fallo honesto sino
    uno que aparece en un punto distinto en cada intento.
  */
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => {
    seguirLaPista(page);
    anotarDestinos(page);
  });

  test.afterAll(async () => {
    if (!cadena) return;
    // Los grupos primero: `on delete cascade` se lleva sus invitados y sus
    // respuestas. Las mesas después, que ya no tienen a nadie sentado.
    await conBase(async (sql) => {
      if (gruposCreados.length > 0) {
        await sql`delete from public.grupos_invitacion where id in ${sql(gruposCreados)}`;
      }
      if (mesasCreadas.length > 0) {
        await sql`delete from public.mesas where id in ${sql(mesasCreadas)}`;
      }
    });
  });

  /**
   * CAMINO FELIZ · BODA-83 · Se crea una mesa, se coloca, se mueve, y la
   * posición sobrevive a recargar.
   *
   * La comprobación que importa es la última: el plano no vale nada si al
   * volver a abrir la pantalla las mesas han vuelto a su sitio de antes. Por eso
   * la posición se afirma **contra la base** y después se vuelve a pedir la
   * página con la URL limpia, sin fiarse de lo que quedó pintado.
   */
  test("una mesa se crea, se coloca en el plano y se queda donde la dejas", async ({
    page,
  }) => {
    const nombre = `${MARCA} Redonda ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_MESAS);

    const alta = seccion(page, copy.panel.mesas.nuevaTitulo);
    await alta.getByLabel(copy.panel.mesas.campoNombre, { exact: true }).fill(nombre);
    await alta.getByLabel(copy.panel.mesas.campoCapacidad, { exact: true }).fill("8");
    await enviar(page, alta.getByRole("button", { name: copy.panel.mesas.crear }));
    await esperarEstado(page, "creada");

    const [creada] = await conBase(
      (sql) => sql<{ id: string; posicion_x: string | null }[]>`
        select id, posicion_x from public.mesas where nombre = ${nombre}
      `,
    );
    expect(creada, "la mesa tiene que existir en la base, no sólo en pantalla").toBeDefined();
    // Se apunta para poder borrarla al acabar: la creó la pantalla, no el SQL.
    mesasCreadas.push(creada.id);
    // Nace sin colocar: crear una mesa no es decidir dónde va.
    expect(creada.posicion_x).toBeNull();

    // Colocarla la deja en el centro, que es desde donde se empuja.
    const suya = seccion(page, nombre);
    await enviar(page, suya.getByRole("button", { name: copy.panel.mesas.colocar }));
    await esperarEstado(page, "colocada");

    // Y un empujón a la derecha la mueve exactamente un paso.
    await enviar(
      page,
      seccion(page, nombre).getByRole("button", {
        name: conValores(copy.panel.mesas.empujarDerecha, { mesa: nombre }),
      }),
    );
    await esperarEstado(page, "movida");

    const [movida] = await conBase(
      (sql) => sql<{ posicion_x: string; posicion_y: string }[]>`
        select posicion_x, posicion_y from public.mesas where id = ${creada.id}
      `,
    );
    expect(Number(movida.posicion_x)).toBe(CENTRO + PASO_PLANO_MESAS);
    expect(Number(movida.posicion_y), "empujar a la derecha no toca la vertical").toBe(CENTRO);

    /*
      SE VUELVE A LA URL LIMPIA, sin `?estado=`. Con `page.reload()` la
      dirección conservaría el estado del paso anterior y cualquier espera
      posterior se cumpliría sola, encontrando el rastro de lo ya hecho.
    */
    await page.goto(RUTA_MESAS);
    await expect(
      seccion(page, nombre).getByLabel(copy.panel.mesas.campoPosicionX, { exact: true }),
    ).toHaveValue(String(CENTRO + PASO_PLANO_MESAS));

    // Y la mesa está en el plano, con su rótulo y su ocupación.
    await expect(
      seccion(page, copy.panel.mesas.planoTitulo).getByRole("link", { name: nombre }),
    ).toBeVisible();

    /*
      LA EXPORTACIÓN VA POR LA MISMA SESIÓN: `page.request` comparte el tarro de
      cookies del navegador, así que esto prueba la ruta tal y como la usa quien
      pulsa el botón, y no una petición anónima que RLS dejaría vacía.
    */
    const fichero = await page.request.get(RUTA_MESAS_EXPORTAR);
    expect(fichero.status()).toBe(200);
    const texto = await fichero.text();
    // El BOM no es opcional: sin él Excel rompe la mitad de los apellidos.
    expect(texto.startsWith("\ufeff"), "el CSV tiene que llevar BOM UTF-8").toBe(true);
    expect(texto).toContain(nombre);
  });

  /**
   * CAMINO FELIZ · BODA-84 · Sentar al grupo entero lo saca de pendientes y
   * suma en el recuento de la mesa.
   */
  test("sentar a un grupo entero lo quita de la lista y lo suma a la mesa", async ({
    page,
  }) => {
    const sello = Date.now();
    const nombreMesa = `${MARCA} Banquete ${sello}`;
    const nombreGrupo = `${MARCA} Familia ${sello}`;

    const mesaId = await crearMesa(nombreMesa, 8);
    await crearGrupo(nombreGrupo, 3, true);

    await entrar(page);
    await page.goto(RUTA_MESAS);

    const pendientes = seccion(page, copy.panel.mesas.sinMesaTitulo);
    const suyo = pendientes.locator("li").filter({ hasText: nombreGrupo });
    await expect(suyo, "los confirmados sin mesa tienen que salir siempre").toHaveCount(1);

    await suyo
      .getByLabel(conValores(copy.panel.mesas.campoMesaGrupo, { grupo: nombreGrupo }), {
        exact: true,
      })
      .selectOption(mesaId);
    await enviar(
      page,
      suyo.getByRole("button", { name: copy.panel.mesas.sentarGrupo, exact: true }),
    );
    await esperarEstado(page, "sentado");

    /*
      PRIMERO LA BASE Y DESPUÉS LA PANTALLA, en ese orden a propósito: lo que el
      ticket promete es que los tres QUEDAN SENTADOS. Si eso falla, el test
      tiene que decir «no se guardó» y no «no lo veo», que manda a buscar el
      problema al sitio equivocado.
    */
    expect(await cuantosSentados(mesaId), "los tres del grupo se sientan juntos").toBe(3);

    // Ya no está pendiente…
    await expect(
      seccion(page, copy.panel.mesas.sinMesaTitulo)
        .locator("li")
        .filter({ hasText: nombreGrupo }),
    ).toHaveCount(0);

    // …y la mesa lo cuenta.
    await expect(seccion(page, nombreMesa)).toContainText(
      conValores(copy.panel.mesas.ocupacion, { sentados: 3, capacidad: 8 }),
    );
  });

  /**
   * CASO DE ERROR · Pasarse de la capacidad se impide, y se explica con cifras.
   *
   * Es el test que justifica el módulo. La base no lo impide —a propósito— así
   * que si esta comprobación se cae, nada más la sujeta.
   */
  test("pasarse de la capacidad no sienta a nadie, y dice cuántos caben", async ({ page }) => {
    const sello = Date.now();
    const nombreMesa = `${MARCA} Pequena ${sello}`;
    const nombreGrupo = `${MARCA} Numerosa ${sello}`;

    const mesaId = await crearMesa(nombreMesa, 2);
    await crearGrupo(nombreGrupo, 3, true);

    await entrar(page);
    await page.goto(RUTA_MESAS);

    const suyo = seccion(page, copy.panel.mesas.sinMesaTitulo)
      .locator("li")
      .filter({ hasText: nombreGrupo });

    await suyo
      .getByLabel(conValores(copy.panel.mesas.campoMesaGrupo, { grupo: nombreGrupo }), {
        exact: true,
      })
      .selectOption(mesaId);
    await enviar(
      page,
      suyo.getByRole("button", { name: copy.panel.mesas.sentarGrupo, exact: true }),
    );
    await esperarEstado(page, "sin-sitio");

    // No ha sentado a nadie: ni al que sí cabía.
    expect(await cuantosSentados(mesaId), "si no caben todos no se sienta a ninguno").toBe(0);

    // Y lo explica con las dos cifras: cuántos caben y cuántos saldrían.
    await expect(
      page.getByText(
        conValores(copy.panel.mesas.errorSinSitio, {
          mesa: nombreMesa,
          caben: 2,
          habria: 3,
        }),
      ),
    ).toBeVisible();

    // El grupo sigue donde estaba, esperando una mesa donde quepa.
    await expect(
      seccion(page, copy.panel.mesas.sinMesaTitulo)
        .locator("li")
        .filter({ hasText: nombreGrupo }),
    ).toHaveCount(1);
  });

  /**
   * Sentar a quien todavía no ha contestado se permite, y avisa.
   *
   * Se permite porque el reparto se empieza antes de que conteste todo el mundo
   * o no se empieza nunca. Se avisa porque lo que no puede pasar es que se
   * olvide que ese sitio está reservado a alguien que quizá no venga.
   */
  test("sentar a alguien que no ha confirmado se guarda, y avisa", async ({ page }) => {
    const sello = Date.now();
    const nombreMesa = `${MARCA} Reserva ${sello}`;
    const nombreGrupo = `${MARCA} Sin contestar ${sello}`;

    const mesaId = await crearMesa(nombreMesa, 8);
    const grupoId = await crearGrupo(nombreGrupo, 1, false);

    const [persona] = await conBase(
      (sql) => sql<{ id: string; nombre_completo: string }[]>`
        select id, nombre_completo from public.invitados where grupo_id = ${grupoId}
      `,
    );

    await entrar(page);
    await page.goto(RUTA_MESAS);

    // Sale en su propia bolsa, separada de los confirmados: son dos problemas
    // distintos y mezclarlos infla la lista que dice cuánto falta.
    const suyo = seccion(page, copy.panel.mesas.sinRespuestaTitulo)
      .locator("li")
      .filter({ hasText: nombreGrupo });
    await expect(suyo).toHaveCount(1);

    await suyo
      .getByLabel(
        conValores(copy.panel.mesas.campoMesaDe, { quien: persona.nombre_completo }),
        { exact: true },
      )
      .selectOption(mesaId);
    await enviar(
      page,
      suyo.getByRole("button", { name: copy.panel.mesas.sentar, exact: true }),
    );
    await esperarEstado(page, "sentado-sin-confirmar");

    // Se ha guardado de verdad…
    const [sentada] = await conBase(
      (sql) => sql<{ mesa_id: string | null }[]>`
        select mesa_id from public.invitados where id = ${persona.id}
      `,
    );
    expect(sentada.mesa_id, "se sienta igual: el sitio queda reservado").toBe(mesaId);

    // …y lo dice, que es la mitad que importa.
    await expect(page.getByText(copy.panel.mesas.avisoSentadoSinConfirmar)).toBeVisible();
  });
});
