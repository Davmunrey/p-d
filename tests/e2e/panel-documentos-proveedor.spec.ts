import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  BUCKET_DOCUMENTOS,
  RUTA_ACCESO,
  RUTA_PANEL,
  RUTA_PROVEEDORES,
} from "../../src/config/constants";
import { laPista, olvidarDestinos, seguirLaPista, ultimoDestino } from "./utiles/rastro";

/**
 * BODA-72 · Contratos, presupuestos y facturas de un proveedor
 *
 * LO QUE SE PRUEBA ES EL CÍRCULO ENTERO Y LA CERRADURA. Subir un PDF de verdad,
 * volver a bajarlo desde el panel y comprobar que lo que baja son los MISMOS
 * BYTES que subieron; y —lo que de verdad justifica que el bucket sea privado—
 * que pedir ese objeto por su URL pública, sin sesión, no devuelve nada.
 *
 * Ese último test es bloqueante a propósito. Aquí dentro hay contratos con
 * datos bancarios y firmas, y el estado que los protege es una AUSENCIA: RLS
 * activada y cero políticas sobre `storage.objects`. Una ausencia no se rompe
 * borrando nada, se rompe añadiendo — y entonces no falla nada a la vista. Sin
 * este test, el día que el bucket pase a público nadie se entera.
 *
 * SÓLO CORRE DONDE HAY SUPABASE DE VERDAD: hace falta sesión, Storage y la
 * clave de servicio. Fuera de ese trabajo de CI se salta solo.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;
const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;

const MARCA = "(DES) E2E Documentos";

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
 * Las secciones se localizan por su título y no por su posición, y las
 * etiquetas se exigen exactas. Mismo motivo que en `panel-proveedores.spec.ts`:
 * «Nombre» es la etiqueta correcta en cuatro formularios de esta pantalla, y
 * resolverlo con `.first()` deja el test en verde probando otra cosa el día que
 * alguien reordene la ficha.
 */
function seccion(pagina: Page, titulo: string) {
  return pagina
    .locator("section")
    .filter({ has: pagina.getByRole("heading", { name: titulo }) });
}

/** Un proveedor de usar y tirar, en la primera categoría que haya. */
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

/**
 * Un PDF pequeño y de verdad.
 *
 * SE FABRICA AQUÍ EN VEZ DE GUARDAR UN FICHERO EN EL REPOSITORIO, igual que el
 * PNG del gestor de medios: se ve de dónde sale cada byte y no hay un binario
 * en el árbol que nadie sabe abrir. Lleva un marcador único dentro para que la
 * comparación de la descarga signifique algo — si volviera el fichero de otra
 * pasada, los bytes no cuadrarían.
 *
 * Storage no lo interpreta: valida el tipo declarado en la subida, no el
 * contenido. La cabecera `%PDF-` está porque un fichero que dice ser un PDF
 * debería parecerlo, no porque nada la exija.
 */
function pdfMinimo(marcador: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n` +
      `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n` +
      `% ${marcador}\n` +
      `trailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

const SIN_DESTINO = "(ninguna acción ha redirigido: ¿llegó a enviarse el formulario?)";

/**
 * ¿A QUÉ ESTADO MANDÓ LA ACCIÓN? Y DEJA LA PANTALLA DONDE ESA REDIRECCIÓN DECÍA.
 *
 * Se afirma sobre el destino que devolvió el servidor, no sobre la barra del
 * navegador: es la decisión de la acción, y llega aunque el enrutador no la
 * aplique — que es exactamente lo que rompe #126 de vez en cuando en este
 * trabajo de CI. Copiado del molde de `panel-medios.spec.ts` y de
 * `panel-proveedores.spec.ts`, donde está el razonamiento largo.
 */
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
  // Consumido: el destino de esta acción no puede valer por el de la siguiente.
  olvidarDestinos(pagina);

  if (destino && !pagina.url().includes(`estado=${esperado}`)) {
    console.warn(`#126: la pestaña no siguió la redirección a ${destino}.`);
    await pagina.goto(destino);
  }

  await pagina.waitForLoadState("networkidle");
}

/**
 * LA URL FIRMADA QUE DEVOLVIÓ LA DESCARGA.
 *
 * La acción de descarga no vuelve a la ficha: redirige FUERA, al enlace que
 * acaba de firmar. Así que aquí no vale `esperarEstado` —no hay `?estado=`— y
 * lo que se busca es la ruta de firma de Storage.
 *
 * SE MIRAN LOS DOS SITIOS. El destino del rastro es el dato de verdad —lo que
 * el servidor contestó—, pero si el enrutador SÍ aplicó la navegación, la
 * pestaña acaba en esa misma URL y sirve igual. Con los dos, este test no
 * depende de por cuál de los dos caminos viaje la redirección.
 */
async function urlFirmada(pagina: Page): Promise<string> {
  const marca = `/storage/v1/object/sign/${BUCKET_DOCUMENTOS}/`;

  try {
    await expect
      .poll(() => `${ultimoDestino(pagina) ?? ""} ${pagina.url()}`, { timeout: 30_000 })
      .toContain(marca);
  } catch (fallo) {
    throw new Error(
      `${(fallo as Error).message}\n\nLo que hizo la pestaña:\n${laPista(pagina)}`,
    );
  }

  const delRastro = ultimoDestino(pagina);
  olvidarDestinos(pagina);

  return delRastro?.includes(marca) ? delRastro : pagina.url();
}

test.afterAll(async () => {
  if (!cadena) return;
  // Los documentos primero: `documentos_proveedor` apunta al proveedor con
  // `on delete restrict`, así que al revés la limpieza fallaría.
  await conBase(async (sql) => {
    await sql`
      delete from public.documentos_proveedor
       where proveedor_id in (select id from public.proveedores where nombre like ${`${MARCA}%`})
    `;
    await sql`delete from public.proveedores where nombre like ${`${MARCA}%`}`;
  });
});

test.describe("Los papeles de un proveedor", () => {
  /*
    Cada paso de esta pantalla es un viaje completo: escribir en la base, subir
    a Storage, redirigir y repintar entera una página `force-dynamic`. En el
    trabajo de CI que levanta Supabase en Docker eso no cabe en el plazo por
    defecto.
  */
  test.slow();

  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena || !urlSupabase,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(({ page }) => seguirLaPista(page));

  /**
   * CAMINO FELIZ · se sube un PDF de verdad y se vuelve a bajar entero.
   */
  test("un contrato se sube, se lista y se descarga con los mismos bytes", async ({
    page,
    request,
  }) => {
    const sello = Date.now();
    const nombreProveedor = `${MARCA} Catering ${sello}`;
    const nombreDocumento = `${MARCA} Contrato ${sello}`;
    const contenido = pdfMinimo(`marcador-${sello}`);

    const proveedorId = await crearProveedor(nombreProveedor);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const papeles = seccion(page, copy.panel.proveedores.documentosTitulo);

    await papeles
      .locator('input[type="file"][name="fichero"]')
      .setInputFiles({ name: "contrato.pdf", mimeType: "application/pdf", buffer: contenido });
    await papeles
      .getByLabel(copy.panel.proveedores.campoTipoDocumento, { exact: true })
      .selectOption({ label: copy.panel.proveedores.tiposDocumento.contrato });
    await papeles
      .getByLabel(copy.panel.proveedores.campoNombreDocumento, { exact: true })
      .fill(nombreDocumento);
    await papeles.getByRole("button", { name: copy.panel.proveedores.subirDocumento }).click();

    await esperarEstado(page, "documento-subido");

    /*
      PRIMERO LA BASE. Lo que el ticket promete es que el papel QUEDA GUARDADO
      con sus metadatos; si eso falla, el test tiene que decir «no se guardó» y
      no «no lo veo», que manda a buscar el problema al sitio equivocado.
    */
    const [fila] = await conBase(
      (sql) => sql<
        {
          id: string;
          tipo: string;
          ruta_almacenamiento: string;
          tipo_mime: string;
          tamano_bytes: string;
        }[]
      >`
        select id, tipo::text as tipo, ruta_almacenamiento, tipo_mime, tamano_bytes
          from public.documentos_proveedor
         where proveedor_id = ${proveedorId} and nombre = ${nombreDocumento}
      `,
    );
    expect(fila, "el documento tenía que estar en la base").toBeDefined();
    expect(fila.tipo).toBe("contrato");
    expect(fila.tipo_mime).toBe("application/pdf");
    expect(Number(fila.tamano_bytes)).toBe(contenido.byteLength);
    // La ruta cuelga del proveedor y la extensión sale del tipo real, no del
    // nombre que trajera el fichero.
    expect(fila.ruta_almacenamiento).toMatch(new RegExp(`^${proveedorId}/[0-9a-z]+\\.pdf$`));

    // Y en pantalla, con quién lo subió y cuánto pesa.
    const suyo = papeles.locator("li").filter({ hasText: nombreDocumento });
    await expect(suyo).toHaveCount(1);
    await expect(suyo).toContainText(copy.panel.proveedores.tiposDocumento.contrato);

    /*
      LA DESCARGA, QUE ES LA MITAD QUE NO SE VE. El bucket es privado, así que
      no hay `<a href>` que seguir: se pulsa, el servidor comprueba quién pide y
      firma un enlace de vida corta. Se recoge ese enlace y se baja el fichero.
    */
    olvidarDestinos(page);
    await suyo
      .getByRole("button", {
        name: copy.panel.proveedores.descargarDocumentoDe.replace("{nombre}", nombreDocumento),
      })
      .click();

    const firmada = await urlFirmada(page);

    /*
      Y SE VUELVE A LA FICHA. La descarga saca al navegador de la aplicación —se
      va al PDF, que es lo que tiene que pasar—, así que los pasos siguientes
      necesitan la pantalla otra vez. Los localizadores son perezosos y se
      vuelven a resolver solos.
    */
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const descarga = await request.get(firmada);

    expect(descarga.ok(), `la URL firmada tenía que servir el fichero: ${firmada}`).toBe(true);
    // LOS MISMOS BYTES. No «un PDF»: exactamente los que subieron, marcador
    // incluido — que es lo que descarta que vuelva el fichero de otra pasada.
    expect(Buffer.compare(await descarga.body(), contenido)).toBe(0);

    /*
      Y LA CERRADURA. El mismo objeto, pedido por la URL pública del bucket y
      sin sesión ninguna, no puede devolverse. Es la afirmación bloqueante del
      ticket: el bucket es privado, y eso es un `false` en una migración que no
      rompe nada a la vista si alguien lo cambia.
    */
    const aPelo = await request.get(
      `${urlSupabase}/storage/v1/object/public/${BUCKET_DOCUMENTOS}/${fila.ruta_almacenamiento}`,
    );
    expect(
      aPelo.ok(),
      `un contrato NO puede servirse por URL pública (devolvió ${aPelo.status()})`,
    ).toBe(false);

    // Borrar pregunta antes, y dice cuál. Un contrato firmado no se pierde por
    // un dedo torcido en un móvil.
    await suyo
      .getByRole("button", {
        name: copy.panel.proveedores.borrarDocumentoDe.replace("{nombre}", nombreDocumento),
      })
      .click();
    await esperarEstado(page, "confirmar-documento");

    const sigue = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.documentos_proveedor where id = ${fila.id}
      `,
    );
    expect(sigue, "el primer envío no puede borrar nada").toHaveLength(1);

    await page.getByRole("button", { name: copy.panel.proveedores.confirmarDocumento }).click();
    await esperarEstado(page, "documento-borrado");

    const restantes = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.documentos_proveedor where id = ${fila.id}
      `,
    );
    expect(restantes).toHaveLength(0);

    // Y el objeto tampoco está: la URL que se firmó antes ya no sirve nada.
    const tras = await request.get(firmada);
    expect(tras.ok(), "el fichero se borra con la fila").toBe(false);
  });

  /**
   * CASO DE ERROR · un fichero que no es un papel se rechaza POR EL TIPO.
   *
   * Es el que pasa de verdad: se arrastra el vídeo de la finca a la carpeta de
   * los contratos. Y lo que importa no es sólo que se rechace, sino que se diga
   * por qué: contarle que pesa demasiado le haría comprimirlo y volver a
   * intentarlo dos veces para nada.
   */
  test("un fichero que no es un papel se rechaza diciendo por qué", async ({ page }) => {
    const sello = Date.now();
    const proveedorId = await crearProveedor(`${MARCA} Rechazo ${sello}`);

    await entrar(page);
    await page.goto(`${RUTA_PROVEEDORES}/${proveedorId}`);

    const papeles = seccion(page, copy.panel.proveedores.documentosTitulo);

    await papeles.locator('input[type="file"][name="fichero"]').setInputFiles({
      name: "finca.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("no soy un contrato"),
    });
    await papeles
      .getByLabel(copy.panel.proveedores.campoNombreDocumento, { exact: true })
      .fill(`${MARCA} Lo que no entra ${sello}`);
    await papeles.getByRole("button", { name: copy.panel.proveedores.subirDocumento }).click();

    await esperarEstado(page, "documento-tipo");
    await expect(page.getByText(copy.panel.proveedores.errorDocumentoTipo)).toBeVisible();

    // Y no ha quedado media fila apuntando a un objeto que no existe.
    const filas = await conBase(
      (sql) => sql<{ id: string }[]>`
        select id from public.documentos_proveedor where proveedor_id = ${proveedorId}
      `,
    );
    expect(filas, "un rechazo no escribe nada en la base").toHaveLength(0);
  });
});
