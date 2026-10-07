import { expect, test } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_AJUSTES, RUTA_PANEL } from "../../src/config/constants";
import { anclaDeCampo } from "../../src/app/panel/ajustes/estado";

/**
 * BODA-44 · Ajustes de la boda
 *
 * Lo que se comprueba aquí es la cadena entera, no la pantalla: que lo que se
 * escribe en el panel sale en la portada de la landing. Si esa vuelta funciona,
 * `configuracion_boda` está de verdad cableada — que es todo el ticket.
 *
 * Necesita sesión, así que vive en el trabajo de CI que levanta el Supabase
 * local y se salta en cualquier otro sitio.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/**
 * EL ROL DE LA CUENTA DE PRUEBAS, CAMBIADO POR SQL. `proteger_privilegios_perfil`
 * no deja cambiar un rol sin un propietario detrás; la excepción de arranque
 * vive sólo dentro de la transacción que la pone, que es lo que se hace aquí.
 */
async function ponerRol(rol: "lector" | "propietario") {
  await conBase((sql) =>
    sql.begin(async (tx) => {
      await tx`select set_config('boda.arranque_en_curso', 'si', true)`;
      await tx`
        update public.perfiles set rol = ${rol}
         where lower(correo_electronico) = lower(${CORREO_CON_ACCESO!})
      `;
    }),
  );
}

/**
 * Marca de agua para no confundir lo que escribe el test con el seed.
 *
 * OJO CON EL PREFIJO «(DES)»: media suite comprueba que la landing enseña los
 * datos del seed buscando justo esa marca. Este fichero es el único que
 * ESCRIBE en `configuracion_boda`, que es una fila única y compartida por
 * todos los tests. Sin conservar el prefijo, cambiar aquí los nombres tumbaba
 * `resiliencia` y `reserva-la-fecha` — y el fallo salía en el fichero de otro,
 * que es la peor forma de enterarse.
 */
const MARCA = "(DES) E2E";

/**
 * El anunciador de rutas de Next también es `role="alert"`, así que buscarlo a
 * secas encuentra dos y Playwright se planta. Los avisos de esta pantalla viven
 * dentro del `<main>` del panel; el de Next, fuera.
 */
function avisoDe(pagina: import("@playwright/test").Page) {
  return pagina.locator("main").getByRole("alert");
}

test.describe("Ajustes de la boda", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
    await page.goto(RUTA_AJUSTES);
  });

  test("se llega desde el menú del panel", async ({ page }) => {
    await page.goto(RUTA_PANEL);
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    await menu.getByRole("link", { name: copy.panel.modulos.ajustes }).click();

    await expect(page).toHaveURL(new RegExp(RUTA_AJUSTES));
    await expect(page.getByRole("heading", { name: copy.panel.ajustes.titulo })).toBeVisible();
  });

  test("la pantalla llega con los datos que hay en la base", async ({ page }) => {
    // Vacío significaría que la consulta no trajo nada y el formulario
    // guardaría encima un hueco.
    await expect(page.getByLabel(copy.panel.ajustes.nombreNovia)).not.toHaveValue("");
    await expect(page.getByLabel(copy.panel.ajustes.fechaCeremonia)).not.toHaveValue("");
  });

  /**
   * CAMINO FELIZ. Cambiar los nombres en el panel los cambia en la portada.
   */
  test("cambiar los nombres los cambia en la portada de la landing", async ({
    page,
    browser,
  }) => {
    const novia = page.getByLabel(copy.panel.ajustes.nombreNovia);
    const novio = page.getByLabel(copy.panel.ajustes.nombreNovio);

    // Se guardan los originales para devolverlos al final: la fila es única y
    // la comparten todos los tests de la suite.
    const noviaOriginal = await novia.inputValue();
    const novioOriginal = await novio.inputValue();

    const nuevaNovia = `${MARCA} Paloma`;
    const nuevoNovio = `${MARCA} David`;
    await novia.fill(nuevaNovia);
    await novio.fill(nuevoNovio);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.getByText(copy.panel.ajustes.guardado)).toBeVisible();
    // Y persiste: al recargar sigue ahí, no era sólo el eco del formulario.
    await page.reload();
    await expect(page.getByLabel(copy.panel.ajustes.nombreNovia)).toHaveValue(nuevaNovia);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(nuevaNovia);
    await expect(page.getByText(nuevoNovio).first()).toBeVisible();

    // Y en todo lo demás que lleva los nombres, que antes salía del copy: la
    // tarjeta al compartir cualquier página —también la de cada invitación—,
    // la cabecera del panel y la puerta de entrada.
    const nombres = `${nuevaNovia} ${copy.portada.conjuncion} ${nuevoNovio}`;
    await page.goto(RUTA_AJUSTES);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", nombres);
    // El lateral sólo se pinta en escritorio, y lleva los nombres arriba.
    await expect(
      page.getByRole("navigation", { name: copy.panel.navegacion }).first(),
    ).toContainText(nombres);
    const anonimo = await browser.newContext({ locale: "es-ES" });
    const puerta = await anonimo.newPage();
    await puerta.goto("/acceso");
    await expect(
      puerta.getByText(copy.acceso.descripcion.replace("{novios}", nombres)),
    ).toBeVisible();
    await anonimo.close();

    await page.goto(RUTA_AJUSTES);
    await page.getByLabel(copy.panel.ajustes.nombreNovia).fill(noviaOriginal);
    await page.getByLabel(copy.panel.ajustes.nombreNovio).fill(novioOriginal);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.getByText(copy.panel.ajustes.guardado)).toBeVisible();
  });

  test("la hora de la ceremonia no se mueve al guardar sin tocarla", async ({ page }) => {
    // El fallo clásico de estos formularios: cada guardado corre la hora unas
    // horas porque el texto sin zona se interpreta con la del servidor.
    const campo = page.getByLabel(copy.panel.ajustes.fechaCeremonia);
    const antes = await campo.inputValue();

    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.getByText(copy.panel.ajustes.guardado)).toBeVisible();

    await expect(page.getByLabel(copy.panel.ajustes.fechaCeremonia)).toHaveValue(antes);
  });

  /**
   * CASO DE ERROR. Una fecha límite posterior a la boda se rechaza con un
   * mensaje claro y no se guarda.
   */
  test("una fecha límite posterior a la boda se rechaza y no se guarda", async ({ page }) => {
    const ceremonia = await page.getByLabel(copy.panel.ajustes.fechaCeremonia).inputValue();
    const limite = page.getByLabel(copy.panel.ajustes.limiteRsvp);
    const antes = await limite.inputValue();

    // Un año después de la ceremonia: imposible por definición.
    const tarde = ceremonia.replace(/^(\d{4})/, (anio) => String(Number(anio) + 1));
    await limite.fill(tarde);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorLimiteTarde);

    // Y lo que importa: no se ha guardado. Sin el aviso en la URL, que con él
    // la pantalla enseña lo que se escribió y no lo que hay.
    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.limiteRsvp)).toHaveValue(antes);
  });

  /**
   * CASO DE ERROR · LA MISMA FECHA QUE LA CEREMONIA TAMBIÉN ES TARDE.
   *
   * El CHECK de la base es estricto (`fecha_limite_rsvp < fecha_hora_ceremonia`)
   * y la comprobación de la acción era `>`: copiar la fecha de la ceremonia tal
   * cual —que es lo que hace uno con prisa— pasaba el aviso propio y la
   * rechazaba la base con el genérico «no hemos podido guardar», sin decir qué
   * campo. Es exactamente el caso que ese aviso existe para explicar.
   */
  test("una fecha límite IGUAL a la de la ceremonia se rechaza con su propio aviso", async ({
    page,
  }) => {
    const ceremonia = await page.getByLabel(copy.panel.ajustes.fechaCeremonia).inputValue();
    const limite = page.getByLabel(copy.panel.ajustes.limiteRsvp);
    const antes = await limite.inputValue();

    await limite.fill(ceremonia);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorLimiteTarde);
    // Y no el genérico, que es lo que salía antes.
    await expect(avisoDe(page)).not.toContainText(copy.panel.ajustes.errorGuardar);

    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.limiteRsvp)).toHaveValue(antes);
  });

  test("unas coordenadas a medias se rechazan", async ({ page }) => {
    // La base exige las dos o ninguna: media coordenada no señala ningún sitio.
    await page.getByLabel(copy.panel.ajustes.latitud).first().fill("42,5987");
    await page.getByLabel(copy.panel.ajustes.longitud).first().fill("");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorCoordenadas);
  });

  /*
    LOS TOPES DE LA BASE, ANTES DE ESCRIBIR. El campo ya corta al escribir;
    esto es lo que pasa si llega igual (un formulario viejo en caché, otro
    navegador). Antes el CHECK lo rechazaba y la pantalla decía «no hemos podido
    guardar los ajustes. Inténtalo de nuevo», que no iba a funcionar nunca.
  */
  test("una dirección más larga de lo que cabe se explica y no se guarda", async ({ page }) => {
    const campo = page.getByLabel(copy.panel.ajustes.direccionCeremonia, { exact: true });
    const tope = Number(await campo.getAttribute("maxlength"));
    expect(tope, "el campo tiene que llevar el tope de la base").toBeGreaterThan(0);

    const larga = `${MARCA} ${"Calle Mayor ".repeat(Math.ceil(tope / 12) + 1)}`;
    await campo.evaluate((input) => input.removeAttribute("maxlength"));
    await campo.fill(larga);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorLargo);

    await page.goto(RUTA_AJUSTES);
    await expect(
      page.getByLabel(copy.panel.ajustes.direccionCeremonia, { exact: true }),
    ).not.toHaveValue(larga);
  });

  test("una frase del paisaje de una sola letra se explica", async ({ page }) => {
    const campo = page.getByLabel(copy.panel.ajustes.paisajeIntro, { exact: true });
    await campo.evaluate((input) => input.removeAttribute("minlength"));
    await campo.fill("Y");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorPaisajeCorto);
  });

  test("un hashtag sin almohadilla se rechaza", async ({ page }) => {
    const hashtag = page.getByLabel(copy.panel.ajustes.hashtag);
    // El navegador ya lo frena por el `pattern`; sin él, decide la acción.
    await expect(hashtag).toHaveAttribute("pattern", /^#/);
    await hashtag.evaluate((input) => input.removeAttribute("pattern"));
    await hashtag.fill("PalomaYDavid");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorHashtag);
  });

  /**
   * FALTA EL RECORRIDO SIN JAVASCRIPT, y no por descuido.
   *
   * El formulario sí es un `<form>` con Server Action: se envía sin una línea
   * de JavaScript de cliente. Lo que no funciona sin JS es **pintar la
   * pantalla**, y no es cosa de este ticket: `src/app/panel/loading.tsx` abre
   * un límite de Suspense para todo el segmento, así que Next sirve el
   * contenido dentro de un contenedor oculto y es un script quien lo coloca.
   * Sin JS, el campo existe en el HTML y no se ve. Le pasa a todo el panel
   * desde BODA-42, no sólo a esta pantalla.
   *
   * Se anota en su propia incidencia en lugar de escribir aquí una versión
   * descafeinada del test que pase sin comprobar lo que dice comprobar. Donde
   * esto importa de verdad es en el RSVP (#42), que lo abren invitados desde un
   * móvil prestado: ahí hay que diseñarlo sin Suspense desde el principio.
   */
  test("el aviso de guardado se anuncia sin interrumpir la lectura", async ({ page }) => {
    // El que sale bien es `status` y el que sale mal es `alert`: el primero no
    // debe cortar a un lector de pantalla y el segundo sí.
    await page.getByLabel(copy.panel.ajustes.hashtag).fill("#PalomaYDavid");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.guardado,
    );
  });

  /**
   * BODA-114 y BODA-116 · La ciudad y los avisos del programa se editan aquí
   * y se ven en la landing. Se restauran al acabar: el seed los deja puestos
   * y el resto de la suite cuenta con ellos.
   */
  test("la ciudad y los avisos del programa se guardan y salen en la landing", async ({
    page,
  }) => {
    const ciudad = page.getByLabel(copy.panel.ajustes.ciudad);
    const avisos = page.getByLabel(copy.panel.ajustes.avisosPrograma);
    const ciudadOriginal = await ciudad.inputValue();
    const avisosOriginales = await avisos.inputValue();

    await ciudad.fill("(DES) Astorga");
    await avisos.fill("(DES) Aviso uno\n\n(DES) Aviso dos\n");
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.guardado,
    );

    await page.goto("/");
    await expect(page.locator("#portada p").first()).toContainText("(DES) Astorga", {
      ignoreCase: true,
    });
    // Las líneas en blanco no cuentan: dos avisos, no cuatro.
    await expect(page.locator("#programa ol + ul li")).toHaveCount(2);
    await expect(page.locator("#programa ol + ul")).toContainText("(DES) Aviso dos");

    await page.goto(RUTA_AJUSTES);
    await page.getByLabel(copy.panel.ajustes.ciudad).fill(ciudadOriginal);
    await page.getByLabel(copy.panel.ajustes.avisosPrograma).fill(avisosOriginales);
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.guardado,
    );
  });

  /**
   * BODA-129 · LA CUENTA PARA LOS REGALOS.
   *
   * Era lo último de la landing que sólo se tocaba por SQL, y la única cosa de
   * esta pantalla que un editor **no** puede cambiar: su política es
   * `configuracion_privada_propietario_actualizar`, no `puede_editar()`. Por eso
   * va en su propio formulario y con su propio botón — con uno solo, o se le
   * niega a un editor todo lo demás o se le cuela el número de cuenta.
   *
   * Se restaura al acabar: la fila es única, el seed trae un IBAN y
   * `regalos.spec.ts` y el menú de la landing cuentan con él.
   */
  test("el IBAN se escribe aquí, se normaliza y sale en la web", async ({ page }) => {
    const iban = page.getByLabel(copy.panel.ajustes.iban, { exact: true });
    const titular = page.getByLabel(copy.panel.ajustes.titularCuenta);

    const ibanOriginal = await iban.inputValue();
    const titularOriginal = await titular.inputValue();

    const titularNuevo = `${MARCA} Paloma y David`;

    // EN MINÚSCULAS Y CON ESPACIOS, que es como se copia de la app del banco.
    // La restricción de la tabla no lo acepta así, y quien lo pega no tiene por
    // qué saberlo: lo arregla la acción, no la persona.
    await iban.fill("es60 0049 1500 0512 3456 7892");
    await titular.fill(titularNuevo);
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();

    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.regalosGuardado,
    );

    await page.reload();
    await expect(
      page.getByLabel(copy.panel.ajustes.iban, { exact: true }),
      "se guarda como lo pide el banco, no como se tecleó",
    ).toHaveValue("ES6000491500051234567892");

    // Y en la web, detrás de su botón: el número no viaja en el HTML (BODA-28).
    await page.goto("/");
    const seccion = page.locator("#regalos");
    await seccion.getByRole("button", { name: copy.regalos.revelar }).click();
    await expect(seccion.getByLabel(copy.regalos.etiquetaCuenta)).toHaveValue(
      "ES60 0049 1500 0512 3456 7892",
    );
    await expect(seccion.getByText(titularNuevo)).toBeVisible();

    // Como estaba.
    await page.goto(RUTA_AJUSTES);
    await page.getByLabel(copy.panel.ajustes.iban, { exact: true }).fill(ibanOriginal);
    await page.getByLabel(copy.panel.ajustes.titularCuenta).fill(titularOriginal);
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      copy.panel.ajustes.regalosGuardado,
    );
  });

  /**
   * CASO DE ERROR. Un IBAN con mala pinta se rechaza con una frase, y no con el
   * nombre de la restricción de Postgres, que es lo que se ve si esto llega a
   * la base.
   */
  test("un IBAN con mala pinta se rechaza y no se guarda", async ({ page }) => {
    const iban = page.getByLabel(copy.panel.ajustes.iban, { exact: true });
    const antes = await iban.inputValue();

    await iban.fill("mi cuenta de toda la vida");
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorIban);

    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.iban, { exact: true })).toHaveValue(antes);
  });

  /**
   * CASO DE ERROR. Siete avisos no caben en una fila de etiquetas: se rechazan
   * antes de llegar a la base, con un mensaje en castellano, y no se guarda
   * nada de lo demás.
   */
  test("más de seis avisos se rechazan y no se guarda nada", async ({ page }) => {
    const avisos = page.getByLabel(copy.panel.ajustes.avisosPrograma);
    const antes = await avisos.inputValue();

    await avisos.fill(["a", "b", "c", "d", "e", "f", "g"].map((l) => `(DES) ${l}`).join("\n"));
    await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

    await expect(avisoDe(page)).toContainText(copy.panel.ajustes.errorAvisos);
    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.avisosPrograma)).toHaveValue(antes);
  });
  /**
   * CASO DE ERROR · Un IBAN con la forma buena y una cifra cambiada.
   *
   * La forma sola lo dejaba pasar, y salía en la web con su botón de copiar:
   * el banco de cada invitado rechazaría la transferencia. El error va junto
   * al campo, y lo escrito sigue ahí para corregir la cifra.
   */
  test("un IBAN con una cifra cambiada se rechaza junto a su campo", async ({ page }) => {
    const iban = page.getByLabel(copy.panel.ajustes.iban, { exact: true });
    const antes = await iban.inputValue();
    const malo = "ES91 2100 0418 4502 0005 1333";

    await iban.fill(malo);
    await page.getByRole("button", { name: copy.panel.ajustes.guardarRegalos }).click();

    const bloque = page.locator(`#${anclaDeCampo("iban_regalos")}`);
    await expect(bloque.getByRole("alert")).toHaveText(copy.panel.ajustes.errorIban);
    await expect(iban).toHaveAttribute("aria-invalid", "true");
    await expect(iban, "lo escrito sigue ahí para corregirlo").toHaveValue(malo);
    await expect(page).toHaveURL(new RegExp(`#${anclaDeCampo("iban_regalos")}$`));

    await page.goto(RUTA_AJUSTES);
    await expect(page.getByLabel(copy.panel.ajustes.iban, { exact: true })).toHaveValue(antes);
  });

  /**
   * CAMINO FELIZ · Un error no deshace lo demás que se había escrito.
   *
   * Se cambiaba el lugar, se ponía mal la fecha límite y, al volver con el
   * aviso, el lugar había vuelto a lo de antes: los veinte campos se
   * repintaban con la base. Ahora vuelve lo escrito, el error está en su campo
   * y, al corregirlo, se guarda todo junto. CASO DE ERROR · nada se ha escrito
   * en la base mientras tanto.
   */
  test("un error en un campo no deshace lo escrito en los demás", async ({ page }) => {
    const lugarEnLaBase = () =>
      conBase(
        async (sql) =>
          (
            await sql<{ lugar: string | null }[]>`
              select lugar_ceremonia as lugar from public.configuracion_boda
            `
          )[0].lugar,
      );

    const lugar = page.getByLabel(copy.panel.ajustes.lugarCeremonia, { exact: true });
    const limite = page.getByLabel(copy.panel.ajustes.limiteRsvp);
    const lugarOriginal = await lugarEnLaBase();
    const limiteOriginal = await limite.inputValue();
    const ceremonia = await page.getByLabel(copy.panel.ajustes.fechaCeremonia).inputValue();
    const lugarNuevo = `${MARCA} Ermita de prueba ${Date.now()}`;

    /*
      SE DEJA COMO ESTABA POR SQL Y EN UN `finally`. Restaurarlo desde la
      pantalla esperaba el aviso «guardado»… que ya estaba puesto por el
      guardado anterior: el test acababa sin esperar al último envío, y en el
      CI el lugar se quedaba cambiado y tumbaba «Reserva la fecha», que busca
      la finca del seed.
    */
    try {
      await lugar.fill(lugarNuevo);
      await limite.fill(ceremonia.replace(/^(\d{4})/, (anio) => String(Number(anio) + 1)));
      await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();

      const bloque = page.locator(`#${anclaDeCampo("fecha_limite_rsvp")}`);
      await expect(bloque.getByRole("alert")).toHaveText(copy.panel.ajustes.errorLimiteTarde);
      await expect(page.getByLabel(copy.panel.ajustes.limiteRsvp)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(
        page.getByLabel(copy.panel.ajustes.lugarCeremonia, { exact: true }),
        "el lugar que se había escrito sigue ahí",
      ).toHaveValue(lugarNuevo);

      // En la base, nada todavía.
      expect(await lugarEnLaBase()).toBe(lugarOriginal);

      // Se corrige la fecha y se guarda: entra también el lugar.
      await page.getByLabel(copy.panel.ajustes.limiteRsvp).fill(limiteOriginal);
      await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
      await expect(page.locator("main").getByRole("status")).toContainText(
        copy.panel.ajustes.guardado,
      );
      await expect.poll(lugarEnLaBase).toBe(lugarNuevo);
      await expect(
        page.getByLabel(copy.panel.ajustes.lugarCeremonia, { exact: true }),
      ).toHaveValue(lugarNuevo);
    } finally {
      await conBase(
        (sql) => sql`update public.configuracion_boda set lugar_ceremonia = ${lugarOriginal}`,
      );
    }
  });

  /**
   * CASO DE ERROR · Dos personas con Ajustes abierto.
   *
   * Quien guardaba el último deshacía en silencio lo del otro, porque el
   * formulario manda los veinte campos. Ahora la segunda pestaña no escribe:
   * lo dice, conserva lo suyo y ofrece ver lo que hay. CAMINO FELIZ · lo de la
   * primera queda en la base.
   */
  test("quien guarda con la pantalla vieja no pisa lo que otro acaba de guardar", async ({
    page,
    context,
  }) => {
    const otra = await context.newPage();
    await otra.goto(RUTA_AJUSTES);

    const hashtag = page.getByLabel(copy.panel.ajustes.hashtag);
    const ciudad = otra.getByLabel(copy.panel.ajustes.ciudad);
    const hashtagOriginal = await hashtag.inputValue();
    const ciudadOriginal = await ciudad.inputValue();
    const hashtagNuevo = `#DES${Date.now()}`;

    try {
      // La primera guarda.
      await hashtag.fill(hashtagNuevo);
      await page.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
      await expect(page.locator("main").getByRole("status")).toContainText(
        copy.panel.ajustes.guardado,
      );

      // La segunda, con la pantalla de antes, también quiere guardar.
      await ciudad.fill("(DES) Ponferrada");
      await otra.getByRole("button", { name: copy.panel.ajustes.guardar }).click();
      await expect(otra.locator("main").getByRole("alert")).toContainText(
        copy.panel.ajustes.errorCambiado,
      );
      await expect(
        otra.getByLabel(copy.panel.ajustes.ciudad),
        "lo suyo, sin perder",
      ).toHaveValue("(DES) Ponferrada");

      const fila = await conBase(
        async (sql) =>
          (
            await sql<{ hashtag: string | null; ciudad: string | null }[]>`
            select hashtag, ciudad_ceremonia as ciudad from public.configuracion_boda
          `
          )[0],
      );
      expect(fila.hashtag, "lo de la primera sigue en la base").toBe(hashtagNuevo);
      expect(fila.ciudad ?? "", "y lo de la segunda no ha entrado").toBe(ciudadOriginal);

      // «Ver lo que hay ahora» enseña lo de la primera.
      await otra.getByRole("link", { name: copy.panel.ajustes.verLoQueHay }).click();
      await expect(otra.getByLabel(copy.panel.ajustes.hashtag)).toHaveValue(hashtagNuevo);
    } finally {
      await otra.close();
      await conBase(
        (sql) => sql`update public.configuracion_boda set hashtag = ${hashtagOriginal || null}`,
      );
    }
  });

  /**
   * CASO DE ERROR · Si la configuración no se puede leer, no se pinta vacía.
   *
   * Un formulario en blanco invitaba a rellenar lo obligatorio y guardar, y eso
   * borraba el lugar, las coordenadas, el paisaje y los avisos. Sale la
   * pantalla de avería del panel, con su «Reintentar».
   */
  test("si la configuración no se puede leer, sale la avería y no un formulario vacío", async ({
    page,
  }) => {
    // Las lecturas son del servidor, no del navegador: se corta la base.
    await conBase((sql) => sql`revoke select on public.configuracion_boda from authenticated`);
    try {
      await page.goto(RUTA_AJUSTES);
      await expect(page.getByRole("heading", { name: copy.panel.errorTitulo })).toBeVisible();
      await expect(page.getByLabel(copy.panel.ajustes.nombreNovia)).toHaveCount(0);
    } finally {
      await conBase((sql) => sql`grant select on public.configuracion_boda to authenticated`);
    }
  });

  /**
   * CASO DE ERROR · Al lector no se le enseña una cuenta vacía.
   *
   * No puede leer la cuenta, así que veía los campos en blanco con «Sin cuenta
   * escrita, la sección de Regalos no aparece» y deducía que no había regalos.
   * CAMINO FELIZ · los campos deshabilitados se ven deshabilitados.
   */
  test("un lector no ve el formulario de la cuenta, y los campos se ven apagados", async ({
    page,
  }) => {
    await ponerRol("lector");
    try {
      await page.goto(RUTA_AJUSTES);
      await expect(page.getByText(copy.panel.ajustes.regalosSoloEditores)).toBeVisible();
      await expect(page.getByLabel(copy.panel.ajustes.iban, { exact: true })).toHaveCount(0);
      await expect(page.getByText(copy.panel.ajustes.regalosAyuda)).toHaveCount(0);

      const nombre = page.getByLabel(copy.panel.ajustes.nombreNovia);
      await expect(nombre).toBeDisabled();
      // Hundido y sin borde: no se pinta igual que un campo que se puede tocar.
      const [apagado, encendido] = await nombre.evaluate((campo) => {
        // Sin la transición de color: si no, se mide el primer fotograma.
        campo.style.transition = "none";
        const medir = () => {
          const calculado = getComputedStyle(campo);
          return `${calculado.backgroundColor}|${calculado.borderTopColor}|${calculado.color}`;
        };
        const antes = medir();
        campo.removeAttribute("disabled");
        const despues = medir();
        campo.setAttribute("disabled", "");
        return [antes, despues];
      });
      expect(apagado, "deshabilitado tiene que verse distinto").not.toBe(encendido);
    } finally {
      await ponerRol("propietario");
    }
  });
});
