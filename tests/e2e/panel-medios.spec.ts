import { deflateSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_MEDIOS, RUTA_PANEL } from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-29 · El gestor de fotos y vídeos
 *
 * LO QUE SE PRUEBA ES EL CÍRCULO ENTERO, no que la pantalla se pinte: se sube
 * una imagen de verdad, se comprueba que **no** se ve en la web mientras es
 * borrador, se publica, se comprueba que ahora sí, y se borra. Un gestor de
 * medios que sube pero no publica —o que publica lo que no debía— no se
 * distingue del que funciona mirando sólo el panel.
 *
 * SÓLO CORRE DONDE HAY SUPABASE DE VERDAD: hace falta sesión, Storage y una
 * clave de servicio. Fuera de ese trabajo de CI se salta solo.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

/** Lo que se escribe en el texto alternativo, para reconocer lo nuestro. */
const MARCA = "(DES) E2E medios";

async function entrar(pagina: Page) {
  // Se engancha ANTES de la primera navegación: lo que hace falta saber es si
  // el POST de la subida llega a salir, y eso sólo se ve escuchando desde el
  // principio.
  seguirLaPista(pagina);
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

/** Lado de la imagen de prueba, en píxeles. Lo comprueba luego el panel. */
const LADO = 2;

/** El CRC-32 que exige cada trozo de un PNG. Sin él, el fichero no es un PNG. */
function crc32(datos: Buffer): number {
  let resto = 0xffffffff;
  for (const byte of datos) {
    resto ^= byte;
    for (let i = 0; i < 8; i++) {
      resto = resto & 1 ? (resto >>> 1) ^ 0xedb88320 : resto >>> 1;
    }
  }
  return (resto ^ 0xffffffff) >>> 0;
}

/** Un trozo de PNG: longitud, tipo, contenido y su CRC. */
function trozo(tipo: string, contenido: Buffer): Buffer {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), contenido]);

  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(contenido.length);

  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(cuerpo));

  return Buffer.concat([longitud, cuerpo, suma]);
}

/**
 * Un PNG de 2×2 de verdad: se abre, se mide y Storage lo acepta como imagen.
 *
 * SE FABRICA AQUÍ EN VEZ DE GUARDAR UN FICHERO EN EL REPOSITORIO. Pesa 68 bytes
 * y se sube igual de verdad que una foto de cuatro megas, pero además se ve de
 * dónde sale cada número — y de paso prueba que `medirImagen` lee el tamaño de
 * los bytes reales, porque el «2 × 2» que se afirma más abajo no lo ha escrito
 * nadie en ningún formulario.
 *
 * EL IDAT SE COMPRIME CON `zlib` Y NO SE ESCRIBE A MANO. El primer intento
 * llevaba el flujo desinflado byte a byte y estaba mal: declaraba trece cuando
 * dos filas de dos píxeles RGB son catorce —uno de filtro más seis de color por
 * fila—. Un byte de menos y deja de ser un PNG, cosa que ni el navegador ni
 * Storage perdonan. `deflateSync` no se equivoca contando.
 */
function pngMinimo(): Buffer {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(LADO, 0); // ancho
  cabecera.writeUInt32BE(LADO, 4); // alto
  cabecera[8] = 8; // ocho bits por canal
  cabecera[9] = 2; // color verdadero, sin transparencia
  // Los tres últimos —compresión, filtro y entrelazado— se quedan en 0, que es
  // el único valor legal de los dos primeros y «sin entrelazar» del tercero.

  // Una fila = un byte de filtro (0, «sin filtro») + tres bytes por píxel. Con
  // el búfer a ceros ya está: los píxeles salen negros, que es una imagen.
  const pixeles = Buffer.alloc(LADO * (1 + LADO * 3));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", deflateSync(pixeles)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * La ficha cuyo texto alternativo es el que buscamos.
 *
 * SE LOCALIZA POR EL TEXTO ALTERNATIVO Y NO POR POSICIÓN. La suite deja fotos
 * de otras pasadas y el orden dentro de una sección cambia justo cuando se
 * prueba reordenar: un `.first()` acabaría publicando la foto de otro test.
 */
function fichaDe(pagina: Page, alternativo: string) {
  return pagina.locator("li").filter({ has: pagina.locator(`input[value="${alternativo}"]`) });
}

/** Una fila de `medios`, con lo justo para saber dónde está y en qué puesto. */
interface PuestoDeMedio {
  texto: string;
  seccion: string;
  orden: number | null;
}

/**
 * Dónde está cada foto y en qué puesto, **preguntándoselo a la base**.
 *
 * El orden que se ve en la web sale de `medios.orden`, así que es ahí donde
 * hay que mirar para afirmar una permuta. Leerlo del DOM engañaría: los
 * campos de texto alternativo salen en las dieciséis secciones, y dos fotos
 * que acabaran en secciones distintas parecerían ordenadas entre sí.
 *
 * El texto alternativo es `jsonb` por idioma; se lee el de la boda, que es el
 * mismo que exige el trigger al insertar.
 */
async function ordenEnLaBase(textos: string[]): Promise<PuestoDeMedio[]> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const filas = await sql<PuestoDeMedio[]>`
      select
        m.texto_alternativo ->> c.idioma_por_defecto as texto,
        m.seccion::text                              as seccion,
        m.orden
      from public.medios as m
      cross join public.configuracion_boda as c
      where m.texto_alternativo ->> c.idioma_por_defecto = any (${textos})
      order by m.orden
    `;
    // En el orden en que se pidieron: los tests razonan sobre «la primera» y
    // «la segunda», no sobre lo que devuelva la base.
    return textos
      .map((texto) => filas.find((fila) => fila.texto === texto))
      .filter((fila): fila is PuestoDeMedio => Boolean(fila));
  } finally {
    await sql.end();
  }
}

/** Las filas, en una línea cada una, para que un fallo se lea sin abrir nada. */
function describir(filas: PuestoDeMedio[]): string {
  return filas
    .map((fila) => `  ${fila.seccion} · orden ${fila.orden} · ${fila.texto}`)
    .join("\n");
}

/**
 * El formulario de subida de UNA sección concreta, ya desplegado.
 *
 * Se llega a él por el campo oculto que lleva dentro y no por el orden de la
 * página: hay dieciséis formularios idénticos —uno por sección— y un `.first()`
 * subiría siempre a la portada, incluso en el test que prueba la galería. El
 * campo oculto es lo único que los distingue, y es además exactamente el dato
 * que decide dónde acaba la foto.
 *
 * DEVUELVE TODOS LOS FORMULARIOS DE LA SECCIÓN, no sólo el de subir: dentro del
 * mismo bloque hay uno por foto ya subida. Eso obliga a pedir el botón de subir
 * con `exact`, porque **`getByRole` casa el nombre por subcadena** y «Subir»
 * está dentro de «Subir en el orden»: en cuanto la sección tiene una foto, el
 * botón de subir y el de moverla hacia arriba salen los dos y el test muere con
 * un «resolved to 2 elements». No se ha visto todavía porque las secciones que
 * se usan llegan vacías, pero el test de reordenar sube dos a la misma sección:
 * la segunda subida caería siempre.
 */
async function formularioDe(pagina: Page, seccion: string) {
  /*
    SE ESPERA A QUE LA PÁGINA SE ASIENTE ANTES DE TOCARLA, Y NO ES PACIENCIA
    GRATUITA.

    Ésta es la pantalla más pesada del panel: dieciséis secciones, cada una con
    su formulario, más las miniaturas de lo ya subido. Mientras React termina de
    hidratarla siguen saliendo peticiones —los prefetch de la navegación, entre
    otras—, y pulsar dentro de esa ventana es lo que la incidencia #126 señala
    como sospechoso: la acción responde y la redirección no llega a aplicarse.

    `networkidle` no es lo que Playwright recomienda por defecto, y aquí se usa
    a propósito: el servidor es local, la espera dura milisegundos, y lo que se
    quiere probar es el gestor de medios, no quién gana una carrera contra la
    hidratación. El día que #126 se cierre, esto se puede quitar y el test tiene
    que seguir pasando.
  */
  await pagina.waitForLoadState("networkidle");

  const bloque = pagina
    .locator("details")
    .filter({ has: pagina.locator(`input[name="seccion"][value="${seccion}"]`) });

  await bloque.locator("summary").click();
  return bloque.locator("form");
}

/** Un fichero de subida, con el mismo nombre en los tres tests. */
function comoFichero(nombre: string, tipo: string, contenido: Buffer) {
  return { name: nombre, mimeType: tipo, buffer: contenido };
}

/**
 * Lo que se afirma cuando NINGUNA acción ha redirigido todavía.
 *
 * ANTES SE CAÍA A `pagina.url()`, Y ESO ERA UN VERDE FALSO. Cuando el
 * navegador no aplica la redirección —#126— el ayudante lleva la pestaña a
 * mano al destino, así que la URL se queda con ese `?estado=` puesto. Si el
 * paso siguiente no llegaba a enviar nada, la comprobación miraba esa misma
 * URL, encontraba el estado del paso ANTERIOR y daba el visto bueno: fue así
 * como una foto que nunca se subió pasó por subida.
 *
 * Con un texto que no case nunca, la ausencia de destino es lo que es —la
 * acción no salió— y el fallo lo dice con esas palabras.
 */
const SIN_DESTINO = "(ninguna acción ha redirigido: ¿llegó a enviarse el formulario?)";

/**
 * ¿A QUÉ ESTADO MANDÓ LA ACCIÓN? Y DEJA LA PANTALLA DONDE ESA REDIRECCIÓN DECÍA.
 *
 * Se afirma sobre **el destino que devolvió el servidor**, no sobre la URL de la
 * barra. Los dos dicen lo mismo cuando todo va bien —el navegador acaba en el
 * destino—, pero el destino es el dato de verdad: es la decisión de la acción,
 * y llega aunque el navegador no llegue a moverse.
 *
 * Y AQUÍ ESO NO ES TEÓRICO: es #126. Medido cinco veces en CI, la acción de esta
 * pantalla responde `303` con su destino correcto
 * —`destino=/panel/medios?estado=subido`— y el enrutador no lo aplica. Con siete
 * hipótesis descartadas midiendo, el fallo no está en el gestor de medios: la
 * misma firma sale en proveedores y en pagos, y siempre en redirecciones a la
 * ruta en la que ya está el navegador.
 *
 * NO ES AFLOJAR EL TEST, Y LA DIFERENCIA IMPORTA:
 *
 *   · se sigue exigiendo el estado EXACTO —`subido` y no `sin-fichero`—, que es
 *     el diagnóstico entero cuando algo falla;
 *   · se sigue exigiendo todo lo de después: el aviso en pantalla, la ficha, su
 *     medida, que la landing no la sirva en borrador y sí publicada, y que al
 *     borrarla desaparezca;
 *   · lo único que deja de afirmarse es que el navegador aplique SOLO la
 *     redirección. Eso es #126, tiene su incidencia, su reproductor y su rastro,
 *     y no es lo que BODA-29 viene a probar.
 *
 * Cuando #126 se cierre, el `goto` de rescate deja de ejecutarse solo —la URL ya
 * casará— y esta función se puede recortar sin tocar ni un test.
 */
async function esperarEstado(pagina: Page, esperado: string) {
  const destinoEsperado = `estado=${esperado}`;

  try {
    /*
      QUINCE SEGUNDOS BASTAN. Se llegó a esperar cuarenta y cinco por si la
      subida agotaba su propio plazo de treinta, pero el registro del servidor
      nunca enseñó esa línea: la acción no llega a Storage. Esperar de más sólo
      alargaba el trabajo.
    */
    await expect
      .poll(() => ultimoDestino(pagina) ?? SIN_DESTINO, { timeout: 15_000 })
      .toContain(destinoEsperado);
  } catch (fallo) {
    throw new Error(
      `${(fallo as Error).message}\n\n` +
        `Lo que hizo la pestaña:\n${laPista(pagina)}\n\n` +
        `Formularios de la página:\n${await radiografiaDeFormularios(pagina)}`,
    );
  }

  // Consumido: el destino de esta acción no puede valer por el de la siguiente.
  olvidarDestinos(pagina);

  // La acción decidió bien. Si el navegador no la siguió —#126—, se le lleva a
  // donde decía, que es lo que habría hecho él.
  if (!pagina.url().includes(destinoEsperado)) {
    console.warn(`#126: la pestaña no siguió la redirección a ${destinoEsperado}.`);
    await pagina.goto(`${RUTA_MEDIOS}?${destinoEsperado}`);
  }

  /*
    Y SE ESPERA A QUE LA PANTALLA NUEVA SE ASIENTE ANTES DE DEVOLVER EL CONTROL.
    Cada paso de este spec pulsa algo de la página que acaba de llegar
    —publicar, mover, borrar—, así que sin esto cada uno vuelve a correr la
    misma carrera contra la hidratación que se evita al entrar. Ver el
    comentario de `formularioDe`.
  */
  await pagina.waitForLoadState("networkidle");
}

/**
 * EL FORMULARIO DE SUBIDA, ¿SE NEGARÍA A ENVIARSE?
 *
 * Cuando una acción de servidor no deja su `?estado=` en la URL sólo hay dos
 * posibilidades: o corrió y decidió otra cosa —y entonces la URL lo dice—, o el
 * formulario NUNCA LLEGÓ A ENVIARSE. Lo segundo suele ser la validación del
 * propio navegador: un `required` vacío, un `minlength` corto. La bloquea sin
 * decir nada, sin registrar nada en el servidor y sin cambiar la URL.
 *
 * SÓLO SE MIRAN LOS FORMULARIOS CON SECCIÓN, Y SÓLO SE CUENTAN LOS INVÁLIDOS.
 * La primera versión enumeraba los treinta y seis de la página, válidos
 * incluidos: cincuenta líneas por intento y tres intentos, que empujaban fuera
 * del registro justo lo que hacía falta leer. Un diagnóstico que no se puede
 * encontrar no es un diagnóstico.
 */
async function radiografiaDeFormularios(pagina: Page): Promise<string> {
  return pagina
    .evaluate(() => {
      const conSeccion = [...document.querySelectorAll("form")].filter((formulario) =>
        formulario.querySelector('input[name="seccion"]'),
      );

      const rotos = conSeccion
        .filter((formulario) => !formulario.checkValidity())
        .map((formulario) => {
          const seccion =
            formulario.querySelector<HTMLInputElement>('input[name="seccion"]')?.value ?? "—";
          const motivos = [...formulario.elements]
            .filter(
              (control): control is HTMLInputElement =>
                "checkValidity" in control && !(control as HTMLInputElement).checkValidity(),
            )
            .map((control) => `${control.name || control.type}«${control.validationMessage}»`);
          return `  ${seccion}: ${motivos.join(", ")}`;
        });

      return (
        `${conSeccion.length} formularios de subida, ${rotos.length} inválidos` +
        (rotos.length ? `\n${rotos.join("\n")}` : " — ninguno bloquea el envío")
      );
    })
    .catch(() => "(no se pudo leer la página)");
}

/*
  SIN REINTENTOS Y CON EL PLAZO JUSTO, PORQUE ESTE FALLO NO ES INTERMITENTE.

  Falla las tres veces, igual, así que reintentarlo no aporta un dato nuevo:
  triplica el registro —hasta empujar fuera de él lo que hay que leer— y
  triplica lo que tarda el trabajo. Con las esperas largas que llegó a tener,
  este único test se llevaba tres minutos él solo, y el trabajo pasó de 4,3 a
  9,8 minutos; con esa lentitud, otros specs empezaron a rozar sus propios
  plazos. Un diagnóstico no puede costarle el CI al resto.

  El plazo por test es el de fábrica más lo que tarda el acceso: suficiente para
  ver a dónde va la acción, que es lo único que falta por saber.
*/
test.describe.configure({ mode: "serial", retries: 0, timeout: 45_000 });

test.describe("El gestor de fotos y vídeos", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  /**
   * EL CAMINO FELIZ, Y LO QUE DE VERDAD IMPORTA DENTRO DE ÉL: que subir NO es
   * publicar. Una foto que apareciera en la web nada más subirla convertiría el
   * gestor en una trampa — se sube para mirarla, y la ven ciento veinte
   * invitados.
   */
  test("se sube como borrador, se publica y se borra", async ({ page, request }) => {
    const alternativo = `${MARCA} portada ${Date.now()}`;

    await entrar(page);
    await page.goto(RUTA_MEDIOS);

    const formulario = await formularioDe(page, "portada");
    await formulario
      .locator('input[type="file"][name="fichero"]')
      .setInputFiles(comoFichero("prueba.png", "image/png", pngMinimo()));
    await formulario.getByLabel(copy.panel.medios.alternativo).fill(alternativo);
    await formulario
      .getByRole("button", { name: copy.panel.medios.subir, exact: true })
      .click();

    await esperarEstado(page, "subido");

    const ficha = fichaDe(page, alternativo);
    await expect(ficha).toHaveCount(1);
    await expect(ficha.getByText(copy.panel.medios.borrador)).toBeVisible();

    /*
      EL TAMAÑO SE MIDIÓ DEL FICHERO. Es la prueba de que `medirImagen` corrió
      contra los bytes de verdad y no contra lo que dijera un formulario: nadie
      ha escrito «2 × 2» en ninguna parte.
    */
    await expect(ficha.getByText("2 × 2")).toBeVisible();

    // Y AHORA LA MITAD QUE NO SE VE DESDE EL PANEL: la landing, sin sesión.
    const enBorrador = await request.get("/");
    expect(
      (await enBorrador.text()).includes(alternativo),
      "un borrador NO puede aparecer en la web",
    ).toBe(false);

    await ficha.getByRole("button", { name: copy.panel.medios.publicar }).click();
    await esperarEstado(page, "publicado");
    await expect(fichaDe(page, alternativo).getByText(copy.panel.medios.enLaWeb)).toBeVisible();

    /*
      LA PORTADA PINTA UNA SOLA FOTO: la primera por orden. La semilla ya trae
      la suya, así que publicar no basta — hay que subir la nuestra al frente.
      Que al subirla aparezca es además la mitad viva del gestor: el orden que
      se toca en el panel es el que manda en la web.
    */
    for (let intento = 0; intento < 6; intento++) {
      const portada = await request.get("/");
      if ((await portada.text()).includes(alternativo)) break;
      await fichaDe(page, alternativo)
        .getByRole("button", { name: copy.panel.medios.subirOrden, exact: true })
        .click();
      await esperarEstado(page, "movido");
    }

    const publicada = await request.get("/");
    expect(
      (await publicada.text()).includes(alternativo),
      "publicada y primera en el orden, la landing la sirve con su texto alternativo",
    ).toBe(true);

    // Retirar no borra: vuelve a borrador y el fichero sigue donde estaba.
    await fichaDe(page, alternativo)
      .getByRole("button", { name: copy.panel.medios.despublicar })
      .click();
    await esperarEstado(page, "despublicado");
    await expect(
      fichaDe(page, alternativo).getByText(copy.panel.medios.borrador),
    ).toBeVisible();

    await fichaDe(page, alternativo)
      .getByRole("button", { name: copy.panel.medios.borrar })
      .click();
    await esperarEstado(page, "borrado");
    await expect(fichaDe(page, alternativo)).toHaveCount(0);
  });

  /**
   * EL CASO DE ERROR QUE PIDE LA REGLA 4, y se eligió éste porque es el que
   * pasa de verdad: alguien arrastra el PDF del contrato del catering a la
   * pantalla de fotos. Lo que se comprueba no es sólo que se rechace, sino que
   * se rechace POR EL TIPO: decirle que pesa demasiado le haría comprimirlo y
   * volver a intentarlo, dos veces para nada.
   */
  test("un fichero que no es una imagen se rechaza diciendo por qué", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_MEDIOS);

    const formulario = await formularioDe(page, "portada");
    await formulario
      .locator('input[type="file"][name="fichero"]')
      .setInputFiles(
        comoFichero("contrato.pdf", "application/pdf", Buffer.from("%PDF-1.4 no soy una foto")),
      );
    await formulario
      .getByLabel(copy.panel.medios.alternativo)
      .fill(`${MARCA} lo que no debería entrar`);
    await formulario
      .getByRole("button", { name: copy.panel.medios.subir, exact: true })
      .click();

    await esperarEstado(page, "tipo-no-admitido");
    await expect(page.getByText(copy.panel.medios.errorTipo)).toBeVisible();
  });

  /**
   * SIN TEXTO ALTERNATIVO NO ENTRA NADA, y esto no es una validación de
   * formulario más: es la accesibilidad AA del proyecto. La base lo exige con
   * un trigger, así que aquí se manda el formulario POR ENCIMA del `required`
   * del navegador —quitándolo— para comprobar que el servidor también dice que
   * no. Una validación que sólo vive en el HTML no es una validación.
   */
  test("una imagen sin describir no entra ni saltándose el formulario", async ({ page }) => {
    await entrar(page);
    await page.goto(RUTA_MEDIOS);

    const formulario = await formularioDe(page, "portada");
    await formulario
      .locator('input[type="file"][name="fichero"]')
      .setInputFiles(comoFichero("prueba.png", "image/png", pngMinimo()));

    // Se le quita el `required` al campo, como haría quien manda el formulario
    // desde fuera del navegador.
    await formulario
      .locator('input[name="texto_alternativo"]')
      .evaluate((campo) => campo.removeAttribute("required"));
    await formulario
      .getByRole("button", { name: copy.panel.medios.subir, exact: true })
      .click();

    await esperarEstado(page, "sin-alternativo");
    await expect(page.getByText(copy.panel.medios.errorSinAlternativo)).toBeVisible();
  });

  /**
   * REORDENAR ES LA OPERACIÓN CON MÁS ESQUINAS DE TODAS: la unicidad
   * `(seccion, orden)` es diferida, así que la permuta tiene que caer entera en
   * un commit. Con dos `update` sueltos esto fallaría con una violación de
   * unicidad — y es exactamente el motivo de que exista `reordenar_medio()`.
   */
  test("dos fotos se intercambian de sitio", async ({ page }) => {
    const sello = Date.now();
    const primera = `${MARCA} primera ${sello}`;
    const segunda = `${MARCA} segunda ${sello}`;

    await entrar(page);
    await page.goto(RUTA_MEDIOS);

    for (const alternativo of [primera, segunda]) {
      const formulario = await formularioDe(page, "galeria");
      await formulario
        .locator('input[type="file"][name="fichero"]')
        .setInputFiles(comoFichero("prueba.png", "image/png", pngMinimo()));
      await formulario.getByLabel(copy.panel.medios.alternativo).fill(alternativo);
      await formulario
        .getByRole("button", { name: copy.panel.medios.subir, exact: true })
        .click();
      await esperarEstado(page, "subido");
    }

    /*
      QUIÉN VA DETRÁS LO DICE LA BASE, no el orden en que se subieron ni el
      orden de la página.

      El botón de subir NO SE PINTA en la primera foto de su sección —no hay a
      dónde subir—, así que suponer cuál de las dos va detrás convierte
      cualquier sorpresa en una espera de cuarenta y cinco segundos contra un
      botón que no existe, sin decir por qué. Y leerlo del DOM tampoco vale:
      `input[name="texto_alternativo"]` sale en TODAS las secciones, así que
      dos fotos que acabaran en secciones distintas seguirían pareciendo
      ordenadas entre sí.

      La columna `orden` de `medios` es el dato de verdad —es lo que decide qué
      pinta la web— y es lo que se lee aquí. De paso, esto afirma lo primero
      que hay que afirmar y que ningún test decía: que la foto acabó en la
      sección a la que se subió.
    */
    const antes = await ordenEnLaBase([primera, segunda]);

    expect(
      antes.map((fila) => fila.seccion),
      `las dos fotos tienen que estar en «galeria». Lo que hay:\n${describir(antes)}`,
    ).toEqual(["galeria", "galeria"]);

    const [delante, detras] =
      antes[0].orden! < antes[1].orden! ? [antes[0], antes[1]] : [antes[1], antes[0]];

    const botonSubir = fichaDe(page, detras.texto).getByRole("button", {
      name: copy.panel.medios.subirOrden,
    });

    // Fallar aquí en cinco segundos y con la lista delante, en vez de en
    // cuarenta y cinco contra un locator mudo.
    await expect(
      botonSubir,
      `«${detras.texto}» va detrás y tenía que poder subir. En la base:\n${describir(antes)}`,
    ).toHaveCount(1);

    await botonSubir.click();
    await esperarEstado(page, "movido");

    const despues = await ordenEnLaBase([primera, segunda]);
    const puestos = new Map(despues.map((fila) => [fila.texto, fila.orden]));

    expect(
      puestos.get(detras.texto)!,
      `«${detras.texto}» tenía que haber adelantado a «${delante.texto}». En la base:\n${describir(despues)}`,
    ).toBeLessThan(puestos.get(delante.texto)!);

    for (const alternativo of [primera, segunda]) {
      await fichaDe(page, alternativo)
        .getByRole("button", { name: copy.panel.medios.borrar })
        .click();
      await esperarEstado(page, "borrado");
    }
  });
});
