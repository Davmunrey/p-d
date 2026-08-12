"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  BUCKET_DOCUMENTOS,
  LONGITUD_MINIMA_NOMBRE,
  RUTA_ACCESO,
  RUTA_PROVEEDORES,
  SEGUNDOS_URL_FIRMADA,
} from "@/config/constants";
import {
  BASE_SERVICIO_NEUTRA,
  ESTADO_INICIAL_PROVEEDOR,
  esBaseServicio,
  esEstadoProveedor,
  esTipoDocumento,
  obtenerContratadosDeCategoria,
  obtenerRutaDocumento,
  type BaseServicio,
} from "@/lib/bbdd/proveedores";
import { admitirDocumento, componerRutaDocumento, identificadorDeRuta } from "@/lib/documentos";
import { leerImporte } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";
import { clienteDeServicio, haySubidaDeMedios } from "@/lib/supabase/servicio";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoProveedores } from "./estado";

/**
 * BODA-70 · LA AGENDA DE LA BODA, DESDE EL PANEL
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE, no este fichero. Las políticas
 * `proveedores_editor_escribir` y `contactos_proveedor_escribir` exigen
 * `puede_editar()`. Aquí sólo se traduce ese «no» a una frase en castellano y
 * se evita ofrecer un botón que va a fallar.
 *
 * OJO CON EL SILENCIO DE RLS: una escritura prohibida no da error, devuelve
 * cero filas tocadas. Por eso cada operación pide de vuelta lo que ha escrito
 * y mira si ha venido algo, en lugar de conformarse con que `error` sea nulo.
 * Sin eso, un lector veía «guardado» sobre una base que no había cambiado.
 *
 * LOS IMPORTES NO PASAN POR `parseFloat` A SECAS. «8.600,50» es como se
 * escribe en castellano y `Number` lo lee como `NaN`; «8600.50» y «8600,50»
 * tienen que significar lo mismo. Se normaliza aquí, una sola vez, y a la base
 * va siempre un número con punto — que es lo que entiende `numeric`.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/** `""` se convierte en `null`: una columna opcional vacía es ausencia, no cadena vacía. */
function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/**
 * Un importe escrito por una persona → un número, o `undefined` si no se puede.
 *
 * La lectura vive en `@/lib/importe` porque la comparten tres pantallas —ficha
 * de proveedor, categorías y gastos— y tres copias del mismo `replace` acaban
 * siendo tres criterios distintos sobre el punto de los millares.
 */
function importe(datos: FormData, campo: string): number | null | undefined {
  return leerImporte(texto(datos, campo));
}

/*
  NO SE REVALIDA LA RUTA A LA QUE SE VA A REDIRIGIR.

  Costó cinco vueltas de CI y el fallo era éste: al crear una categoría, la
  categoría SE CREABA y la pantalla se repintaba con ella dentro, pero la URL se
  quedaba sin el `?estado=` — y sin él no sale el aviso de «hecho». El invitado
  ve la pantalla cambiada y ningún mensaje, que es justo la duda que el aviso
  existe para quitar.

  `revalidatePath` de la ruta destino y `redirect` a esa misma ruta compiten: el
  refresco repinta la página donde ya estás y la redirección, que sólo añadía
  una query, se pierde por el camino. Y es redundante además — estas pantallas
  son `force-dynamic`, así que la redirección ya las vuelve a leer de la base
  entera. Se revalida sólo lo que NO se va a visitar.
*/
function volver(
  estado: EstadoProveedores,
  proveedorId?: string,
  /**
   * Lo que la pantalla necesita saber además del estado.
   *
   * Existe por la confirmación de borrado de un documento: en la ficha hay
   * varios, así que «estás a punto de borrar» sin decir CUÁL es exactamente el
   * `confirm()` del navegador que este proyecto no usa. Con el identificador en
   * la URL, la pantalla enseña el nombre del papel que se va a perder.
   */
  extra?: Record<string, string>,
): never {
  const base = proveedorId ? `${RUTA_PROVEEDORES}/${proveedorId}` : RUTA_PROVEEDORES;
  const consulta = new URLSearchParams({ estado, ...extra });
  redirect(`${base}?${consulta.toString()}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Traduce el fallo de la base a un estado de pantalla.
 *
 * `42501` y `RSV06` son «no tienes permiso»; `23503` es una clave ajena que
 * impide borrar. El resto es una avería nuestra y se registra entera: el
 * mensaje de PostgREST dice qué restricción saltó, y esa línea es la diferencia
 * entre arreglarlo en un minuto o a ciegas.
 */
function motivo(error: { code?: string; message?: string }): EstadoProveedores {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  if (error.code === "23503") return "en-uso";
  console.error("Fallo escribiendo en proveedores:", error);
  return "error";
}

/* -------------------------------------------------------------------------- */
/*  Categorías                                                                */
/* -------------------------------------------------------------------------- */

export async function crearCategoria(datos: FormData): Promise<void> {
  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volver("nombre");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("categorias_proveedor")
    .insert({
      nombre,
      descripcion: opcional(datos, "descripcion"),
      // Al final de la lista: quien la crea la coloca después si quiere, y una
      // categoría nueva que aparece la primera desordena lo que ya estaba.
      orden: Number(texto(datos, "orden") || "99"),
    })
    .select("id");

  if (error) volver(motivo(error));
  // Cero filas y sin error es RLS callando: un lector no crea categorías.
  if (!data?.length) volver("sin-permiso");

  volver("categoria-creada");
}

export async function borrarCategoria(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("categorias_proveedor")
    .delete()
    .eq("id", id)
    .select("id");

  // `on delete restrict` desde `proveedores`: la base se niega, y es lo
  // correcto — borrar la categoría dejaría a sus proveedores sin clasificar.
  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("categoria-borrada");
}

/* -------------------------------------------------------------------------- */
/*  Proveedores                                                               */
/* -------------------------------------------------------------------------- */

/** Los campos que comparten el alta y la edición, ya validados. */
function camposProveedor(datos: FormData):
  | { ok: false; estado: EstadoProveedores }
  | {
      ok: true;
      valores: {
        categoria_id: string;
        nombre: string;
        persona_contacto: string | null;
        correo_electronico: string | null;
        telefono: string | null;
        sitio_web: string | null;
        valoracion: number | null;
        importe_presupuestado: number | null;
        importe_acordado: number | null;
        iva_incluido: boolean | null;
        notas: string | null;
      };
    } {
  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) return { ok: false, estado: "nombre" };

  const categoriaId = texto(datos, "categoria_id");
  if (!categoriaId) return { ok: false, estado: "categoria" };

  const presupuestado = importe(datos, "importe_presupuestado");
  const acordado = importe(datos, "importe_acordado");
  if (presupuestado === undefined || acordado === undefined) {
    return { ok: false, estado: "importe" };
  }

  const valoracionBruta = texto(datos, "valoracion");
  const valoracion = valoracionBruta ? Number(valoracionBruta) : null;
  if (
    valoracion !== null &&
    (!Number.isInteger(valoracion) || valoracion < 1 || valoracion > 5)
  ) {
    return { ok: false, estado: "valoracion" };
  }

  /*
    UN SITIO WEB SE PEGA COMO SE COPIA: «finca-la-sierra.es», sin protocolo. La
    base exige `http://` o `https://`, así que rechazarlo sería devolver un
    error por algo que se entiende perfectamente. Se completa con `https://`.
  */
  const webBruta = opcional(datos, "sitio_web");
  const sitioWeb =
    webBruta && !/^https?:\/\//i.test(webBruta) ? `https://${webBruta}` : webBruta;

  /*
    BODA-73 · EL IVA ES UN DESPLEGABLE DE TRES Y NO UNA CASILLA.

    Una casilla sólo sabe decir sí o no, y aquí la tercera respuesta es la más
    común: el presupuesto NO LO DICE. Con una casilla, ese caso se guardaría
    como «no lo lleva» —que es lo que significa una casilla sin marcar— y la
    comparativa inventaría un 21 % que nadie ha dicho. Con `null` explícito, la
    pantalla avisa en vez de suponer.
  */
  const ivaBruto = texto(datos, "iva_incluido");
  const ivaIncluido = ivaBruto === "si" ? true : ivaBruto === "no" ? false : null;

  return {
    ok: true,
    valores: {
      categoria_id: categoriaId,
      nombre,
      persona_contacto: opcional(datos, "persona_contacto"),
      correo_electronico: opcional(datos, "correo_electronico"),
      telefono: opcional(datos, "telefono"),
      sitio_web: sitioWeb,
      valoracion,
      importe_presupuestado: presupuestado,
      importe_acordado: acordado,
      iva_incluido: ivaIncluido,
      notas: opcional(datos, "notas"),
    },
  };
}

export async function crearProveedor(datos: FormData): Promise<void> {
  const campos = camposProveedor(datos);
  if (!campos.ok) volver(campos.estado);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("proveedores")
    /*
      EL ESTADO NO SE ELIGE AL DAR DE ALTA. Un proveedor que acabas de apuntar
      está, por definición, en «investigando» — y ofrecer el desplegable aquí
      abría un segundo camino a «contratado» que se saltaría el aviso de
      contratar a dos de la misma categoría. Se cambia después, con el control
      que sí lo comprueba.
    */
    .insert({ ...campos.valores, estado: ESTADO_INICIAL_PROVEEDOR })
    .select("id");

  if (error) volver(motivo(error));
  const creado = data?.[0]?.id as string | undefined;
  if (!creado) volver("sin-permiso");

  revalidatePath(RUTA_PROVEEDORES);
  // A su ficha: quien acaba de dar de alta un proveedor sigue teniendo cosas
  // que apuntar de él, y volver a la lista obliga a buscarlo otra vez.
  redirect(`${RUTA_PROVEEDORES}/${creado}?estado=creado`);
}

/**
 * BODA-71 · CAMBIAR DE FASE
 *
 * Tiene su propia acción y no vive en el formulario grande, por tres razones
 * que se refuerzan entre sí:
 *
 *  1. Es lo que más se hace. Un proveedor cambia de fase cinco o seis veces y
 *     su teléfono no cambia nunca; obligar a abrir el formulario entero para
 *     mover una fase es pedir seis pasos donde hace falta uno.
 *  2. Se puede hacer desde la lista, que es donde se está cuando uno repasa a
 *     quién le falta contestar.
 *  3. Y sobre todo: **es el único camino a `contratado`**, así que el aviso de
 *     contratar a dos de la misma categoría no se puede esquivar. Con el
 *     estado dentro del formulario grande había dos puertas y sólo una tenía
 *     el aviso puesto.
 *
 * DOS GUARDAS, Y LAS DOS SON DE LA BASE TAMBIÉN:
 *
 *  - Descartar exige decir por qué. Lo impone un `check`, así que sin motivo
 *    la escritura falla de todas formas; aquí se dice antes y con una frase.
 *  - Salir de «descartado» BORRA el motivo, y no es cosmético: el mismo
 *    `check` prohíbe que un proveedor no descartado conserve uno. Sin esto,
 *    recuperar a alguien que se había descartado fallaba con un error de la
 *    base que no dice nada.
 */
export async function cambiarEstado(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const nuevo = texto(datos, "estado");
  if (!esEstadoProveedor(nuevo)) volver("estado", id);

  const motivo_descarte = nuevo === "descartado" ? opcional(datos, "motivo_descarte") : null;
  if (nuevo === "descartado" && !motivo_descarte) volver("descarte-sin-motivo", id);

  const supabase = await cliente();

  /*
    CONTRATAR A UN SEGUNDO DE LA MISMA CATEGORÍA PREGUNTA ANTES.

    No se prohíbe —hay bodas con dos fotógrafos, y con un DJ y un grupo— pero
    lo normal es que sea un despiste: se contrata al bueno y se olvida
    descartar al otro, y a partir de ahí el resumen de «qué falta por cerrar»
    miente en la dirección tranquilizadora.
  */
  if (nuevo === "contratado" && texto(datos, "confirmar") !== "si") {
    const { data: ficha } = await supabase
      .from("proveedores")
      .select("categoria_id")
      .eq("id", id)
      .maybeSingle();

    const categoriaId = (ficha as { categoria_id: string } | null)?.categoria_id;
    if (categoriaId) {
      const otros = await obtenerContratadosDeCategoria(categoriaId, id);
      if (otros.length > 0) volver("confirmar-contratado", id);
    }
  }

  const { data, error } = await supabase
    .from("proveedores")
    .update({ estado: nuevo, motivo_descarte })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), id);
  if (!data?.length) volver("sin-permiso", id);

  revalidatePath(RUTA_PROVEEDORES);
  volver("estado-cambiado", id);
}

export async function editarProveedor(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const campos = camposProveedor(datos);
  if (!campos.ok) volver(campos.estado, id);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("proveedores")
    .update(campos.valores)
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), id);
  if (!data?.length) volver("sin-permiso", id);

  revalidatePath(RUTA_PROVEEDORES);
  volver("editado", id);
}

/**
 * BORRAR AVISA ANTES SI HAY DINERO DE POR MEDIO.
 *
 * `partidas_presupuesto.proveedor_id` es `on delete set null`: el gasto ocurrió
 * y sigue contando aunque el proveedor salga de la agenda. Eso está bien para
 * la contabilidad y es un desastre para quien borra sin saberlo — el gasto se
 * queda ahí, sin proveedor, y dentro de tres meses nadie sabe de quién era esa
 * factura de 8.600 €.
 *
 * Así que el primer envío no borra: devuelve el aviso, y la pantalla enseña
 * qué gastos cuelgan y un botón que ya trae la confirmación. Dos pasos, los dos
 * por `POST`, y sin una línea de JavaScript.
 *
 * Servicios y documentos no necesitan este trato: la base los tiene con
 * `on delete restrict` y se niega ella sola. Ese «no» sí llega como error.
 */
export async function borrarProveedor(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const supabase = await cliente();

  if (texto(datos, "confirmar") !== "si") {
    const { count } = await supabase
      .from("partidas_presupuesto")
      .select("id", { count: "exact", head: true })
      .eq("proveedor_id", id);

    if ((count ?? 0) > 0) volver("confirmar-borrado", id);
  }

  const { data, error } = await supabase.from("proveedores").delete().eq("id", id).select("id");

  if (error) volver(motivo(error), id);
  if (!data?.length) volver("sin-permiso", id);

  volver("borrado");
}

/* -------------------------------------------------------------------------- */
/*  Contactos                                                                 */
/* -------------------------------------------------------------------------- */

export async function anadirContacto(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  if (!proveedorId) volver("no-existe");

  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volver("nombre", proveedorId);

  const correo = opcional(datos, "correo_electronico");
  const telefono = opcional(datos, "telefono");
  // La base lo exige también; aquí se dice antes y mejor. Un contacto al que
  // no se puede llamar no sirve para lo único que sirve esta tabla.
  if (!correo && !telefono) volver("contacto-sin-via", proveedorId);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("contactos_proveedor")
    .insert({
      proveedor_id: proveedorId,
      nombre,
      papel: opcional(datos, "papel"),
      correo_electronico: correo,
      telefono,
      es_del_dia: texto(datos, "es_del_dia") === "si",
      notas: opcional(datos, "notas"),
    })
    .select("id");

  if (error) volver(motivo(error), proveedorId);
  if (!data?.length) volver("sin-permiso", proveedorId);

  volver("contacto-anadido", proveedorId);
}

export async function quitarContacto(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  const id = texto(datos, "id");
  if (!proveedorId || !id) volver("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("contactos_proveedor")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), proveedorId);
  if (!data?.length) volver("sin-permiso", proveedorId);

  volver("contacto-quitado", proveedorId);
}

/* -------------------------------------------------------------------------- */
/*  BODA-72 · Documentos: contratos, presupuestos y facturas                  */
/* -------------------------------------------------------------------------- */

/**
 * EL ORDEN DE LAS DOS ESCRITURAS, QUE ES LA DECISIÓN DEL TICKET
 *
 * Subir y borrar tocan dos sitios que no comparten transacción: la FILA en
 * `documentos_proveedor` y el OBJETO en el bucket `documentos`. Falle cual
 * falle, hay que elegir qué basura se prefiere — y aquí, además, hay algo más
 * gordo que la basura de por medio.
 *
 * LA FILA VA PRIMERO EN LAS DOS OPERACIONES, y no por simetría con el gestor de
 * fotos: por autorización. El bucket es privado y `storage.objects` tiene RLS
 * con CERO políticas, así que **la única llave que abre Storage es la clave de
 * servicio**, que no representa a nadie y no comprueba nada. Si el objeto fuera
 * primero:
 *
 *   · al subir, un lector podría llenar el bucket de ficheros y enterarse
 *     después de que su fila no entra;
 *   · al borrar —y esto es lo grave— un lector borraría el contrato firmado del
 *     catering, para siempre, y sólo entonces RLS le diría que no podía. La
 *     fila seguiría ahí apuntando a un objeto que ya no existe.
 *
 * Con la fila delante, quien decide es `puede_editar()` dentro de la base,
 * ANTES de que la clave de servicio toque un solo byte.
 *
 * Lo que queda como peor caso aceptable es un fichero huérfano en un bucket
 * privado: ocupa espacio, no lo referencia nada, y nadie puede llegar a él
 * porque la descarga se firma a partir de una fila que ya no está.
 *
 * SOBRE `haySubidaDeMedios` CON ESTE NOMBRE EN UN MÓDULO DE PROVEEDORES: lo que
 * comprueba no es nada de medios, es que exista `SUPABASE_SERVICE_ROLE_KEY` —la
 * única llave que abre Storage, sea cual sea el bucket—. Se importa tal cual en
 * vez de duplicar la comprobación con otro nombre: dos banderas que miran la
 * misma variable acaban discrepando el día que una se quede sin actualizar.
 */
function fichero(datos: FormData, campo: string): File | null {
  const valor = datos.get(campo);
  return valor instanceof File && valor.size > 0 ? valor : null;
}

/** Lo más largo que admite `documentos_proveedor_nombre_longitud`. */
const LONGITUD_MAXIMA_NOMBRE_DOCUMENTO = 200;

export async function subirDocumento(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  if (!proveedorId) volver("no-existe");

  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  // La protección de verdad es RLS, que decide en el `insert` de más abajo.
  // Esto sólo evita subir veinte megas para que después le digan que no.
  if (acceso.rol === "lector") volver("sin-permiso", proveedorId);

  if (!haySubidaDeMedios) volver("sin-configurar", proveedorId);

  const tipoBruto = texto(datos, "tipo");
  if (!esTipoDocumento(tipoBruto)) volver("error", proveedorId);

  const original = fichero(datos, "fichero");
  if (!original) volver("documento-sin-fichero", proveedorId);

  /*
    EL NOMBRE SE PUEDE DEJAR EN BLANCO, y entonces lo pone el fichero. Quien
    sube «Contrato firmado catering.pdf» ya ha escrito el nombre una vez; pedirle
    que lo teclee otra es la clase de campo obligatorio que se rellena con «a».
  */
  const nombre = (texto(datos, "nombre") || original.name).trim();
  if (!nombre || nombre.length > LONGITUD_MAXIMA_NOMBRE_DOCUMENTO) {
    volver("documento-nombre", proveedorId);
  }

  /*
    TIPO Y PESO ANTES DE TOCAR LA RED. El bucket lo vuelve a comprobar —es la
    última línea— pero enterarse aquí evita mandar el fichero a Storage para
    nada, y sobre todo permite decir POR QUÉ no vale con una frase en vez de con
    un error de la API.
  */
  const veredicto = admitirDocumento(original);
  if (!veredicto.admitido) {
    volver(veredicto.motivo === "tipo" ? "documento-tipo" : "documento-peso", proveedorId);
  }

  const ruta = componerRutaDocumento(
    proveedorId,
    veredicto.extension,
    identificadorDeRuta(Math.random()),
  );

  // 1. LA FILA. Aquí es donde RLS dice si esta persona puede o no.
  const supabase = await cliente();
  const { data: fila, error } = await supabase
    .from("documentos_proveedor")
    .insert({
      proveedor_id: proveedorId,
      tipo: tipoBruto,
      nombre,
      ruta_almacenamiento: ruta,
      tipo_mime: original.type,
      tamano_bytes: original.size,
      // `perfiles.id`, NO el de Auth: es a `perfiles` a quien apunta
      // `documentos_proveedor_subido_por_fk`.
      subido_por: acceso.perfilId,
    })
    .select("id")
    .maybeSingle();

  if (error) volver(motivo(error), proveedorId);
  if (!fila) volver("sin-permiso", proveedorId);

  // 2. Y AHORA EL FICHERO, con la única llave que abre un bucket privado.
  const servicio = clienteDeServicio();
  const desde = Date.now();
  let fallo: { message?: string } | null = null;
  try {
    ({ error: fallo } = await servicio.storage
      .from(BUCKET_DOCUMENTOS)
      .upload(ruta, original, { contentType: original.type, upsert: false }));
  } catch (causa) {
    /*
      El corte por plazo NO llega aquí: `storage-js` lo recoge y lo devuelve
      como `error`. Este `catch` cubre lo otro —que la red se caiga de una
      forma que sí lance— para que ninguna excepción se escape de la acción sin
      convertirse en una pantalla.
    */
    fallo = causa as { message?: string };
  } finally {
    console.info(`Storage: ${ruta} resuelto en ${Date.now() - desde} ms`);
  }

  /*
    SI EL FICHERO NO SUBIÓ, LA FILA NO SE QUEDA. Una fila apuntando a un objeto
    que no existe es un contrato que la ficha promete y la descarga no puede
    dar — y nadie se entera hasta el día que hace falta el contrato.
  */
  if (fallo) {
    console.error("No se pudo subir el documento a Storage:", fallo);
    await supabase.from("documentos_proveedor").delete().eq("id", fila.id);
    volver("error", proveedorId);
  }

  volver("documento-subido", proveedorId);
}

/**
 * DESCARGAR: UNA URL FIRMADA Y CORTA, NO UN ENLACE AL BUCKET.
 *
 * El bucket es privado, así que no hay URL pública que dar. Lo que hace esta
 * acción es comprobar quién pide —`accesoActual()` y, sobre todo, la lectura de
 * la fila con el cliente de SESIÓN, que es la que pasa por RLS— y sólo entonces
 * pedirle a Storage un enlace con caducidad.
 *
 * CADUCA EN `SEGUNDOS_URL_FIRMADA`, y es a propósito que sea poco: lo que se
 * firma es «este clic», no «este fichero para siempre». Un enlace que acabe
 * pegado en un grupo de WhatsApp deja de servir antes de que nadie lo abra.
 *
 * Un lector también descarga: leer el contrato es exactamente lo que un lector
 * tiene que poder hacer.
 */
export async function descargarDocumento(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  const id = texto(datos, "id");
  if (!proveedorId || !id) volver("no-existe");

  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  if (!haySubidaDeMedios) volver("sin-configurar", proveedorId);

  // Con la sesión de quien pide: si RLS no le deja ver la fila, no hay ruta que
  // firmar, y «no existe» es exactamente lo que hay que contestar.
  const ruta = await obtenerRutaDocumento(id, proveedorId);
  if (!ruta) volver("no-existe", proveedorId);

  const { data, error } = await clienteDeServicio()
    .storage.from(BUCKET_DOCUMENTOS)
    .createSignedUrl(ruta, SEGUNDOS_URL_FIRMADA);

  if (error || !data?.signedUrl) {
    console.error("No se pudo firmar la descarga del documento:", error);
    volver("error", proveedorId);
  }

  // Fuera del `try`/`catch` de arriba a propósito: `redirect` funciona lanzando,
  // y un `catch` alrededor se lo tragaría.
  redirect(data.signedUrl);
}

/**
 * BORRAR UN DOCUMENTO, EN DOS PASOS.
 *
 * El primer envío no borra: devuelve la pantalla de confirmación con el nombre
 * del papel dentro. Un contrato firmado no se pierde por un dedo torcido en un
 * móvil, y un `confirm()` del navegador —que además exigiría JavaScript— no
 * dice cuál de los cinco documentos se está a punto de tirar.
 *
 * El orden fila → objeto y por qué está explicado arriba, en la cabecera de la
 * sección.
 */
export async function borrarDocumento(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  const id = texto(datos, "id");
  if (!proveedorId || !id) volver("no-existe");

  if (texto(datos, "confirmar") !== "si") {
    volver("confirmar-documento", proveedorId, { documento: id });
  }

  // 1. LA FILA, con la sesión: si esta persona no puede borrar, no se ha tocado
  //    ningún fichero.
  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_proveedor")
    .delete()
    .eq("id", id)
    .eq("proveedor_id", proveedorId)
    .select("ruta_almacenamiento")
    .maybeSingle();

  if (error) volver(motivo(error), proveedorId);
  if (!data) volver("sin-permiso", proveedorId);

  // 2. Y AHORA EL OBJETO.
  if (haySubidaDeMedios) {
    const { error: fallo } = await clienteDeServicio()
      .storage.from(BUCKET_DOCUMENTOS)
      .remove([(data as { ruta_almacenamiento: string }).ruta_almacenamiento]);

    /*
      Se registra pero no se convierte en error de pantalla: la fila ya no está,
      así que el documento ha desaparecido de la ficha y nadie puede volver a
      firmarlo. Queda un huérfano en un bucket privado, que es el peor caso
      aceptable de los dos posibles.
    */
    if (fallo) console.error("Fila borrada, documento huérfano en Storage:", fallo);
  }

  volver("documento-borrado", proveedorId);
}

/* -------------------------------------------------------------------------- */
/*  BODA-74 · Servicios: lo que incluye cada proveedor, y cuánto cuesta hoy   */
/* -------------------------------------------------------------------------- */

interface ValoresServicio {
  nombre: string;
  descripcion: string | null;
  precio_unitario: number;
  cantidad: number;
  por_invitado: boolean;
  base_calculo: BaseServicio;
  minimo_garantizado: number | null;
}

/**
 * Los campos de un servicio, ya validados.
 *
 * DOS CAMPOS SÓLO TIENEN SENTIDO SI EL PRECIO ES POR INVITADO, y esta pantalla
 * funciona sin JavaScript: no se pueden esconder al desmarcar la casilla. Así
 * que están siempre, con su ayuda diciendo cuándo tocan, y aquí se resuelve qué
 * pasa con ellos — pero NO de la misma forma, porque no son lo mismo:
 *
 *   · `base_calculo` SE FUERZA al valor neutro. Es un desplegable con un valor
 *     por defecto, así que nadie ha «escrito» nada que se pueda perder, y
 *     `servicios_base_solo_por_invitado` exige `todos` en la base. Rechazarlo
 *     sería un error por algo que la persona no ha hecho.
 *   · `minimo_garantizado` SE RECHAZA. Ahí sí hay un número tecleado a mano, y
 *     tragárselo en silencio sería borrar lo que alguien acaba de escribir. Se
 *     dice, y quien lo escribió decide.
 */
function camposServicio(
  datos: FormData,
): { ok: false; estado: EstadoProveedores } | { ok: true; valores: ValoresServicio } {
  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) return { ok: false, estado: "servicio-nombre" };

  const precio = importe(datos, "precio_unitario");
  if (precio === undefined) return { ok: false, estado: "servicio-precio" };

  const cantidad = Number(texto(datos, "cantidad") || "1");
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { ok: false, estado: "servicio-cantidad" };
  }

  const porInvitado = texto(datos, "por_invitado") === "si";

  const baseBruta = texto(datos, "base_calculo");
  const base: BaseServicio =
    porInvitado && esBaseServicio(baseBruta) ? baseBruta : BASE_SERVICIO_NEUTRA;

  const minimo = importe(datos, "minimo_garantizado");
  if (minimo === undefined) return { ok: false, estado: "servicio-minimo" };
  if (minimo !== null && !porInvitado) return { ok: false, estado: "servicio-minimo-suelto" };

  return {
    ok: true,
    valores: {
      nombre,
      descripcion: opcional(datos, "descripcion"),
      // La columna es `not null default 0`: sin precio escrito, el servicio
      // está apuntado pero todavía no cuesta nada, que es un estado real.
      precio_unitario: precio ?? 0,
      cantidad,
      por_invitado: porInvitado,
      base_calculo: base,
      minimo_garantizado: minimo,
    },
  };
}

export async function crearServicio(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  if (!proveedorId) volver("no-existe");

  const campos = camposServicio(datos);
  if (!campos.ok) volver(campos.estado, proveedorId);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("servicios")
    .insert({ ...campos.valores, proveedor_id: proveedorId })
    .select("id");

  if (error) volver(motivo(error), proveedorId);
  if (!data?.length) volver("sin-permiso", proveedorId);

  volver("servicio-creado", proveedorId);
}

export async function editarServicio(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  const id = texto(datos, "id");
  if (!proveedorId || !id) volver("no-existe");

  const campos = camposServicio(datos);
  if (!campos.ok) volver(campos.estado, proveedorId);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("servicios")
    .update(campos.valores)
    .eq("id", id)
    .eq("proveedor_id", proveedorId)
    .select("id");

  if (error) volver(motivo(error), proveedorId);
  if (!data?.length) volver("sin-permiso", proveedorId);

  volver("servicio-editado", proveedorId);
}

/**
 * Borrar un servicio no pregunta antes, y es una diferencia a propósito con los
 * documentos: un servicio es una línea del desglose que se vuelve a teclear en
 * quince segundos, y un contrato firmado no se recupera. Preguntar por todo es
 * la forma más rápida de que dejen de leerse las preguntas.
 */
export async function borrarServicio(datos: FormData): Promise<void> {
  const proveedorId = texto(datos, "proveedor_id");
  const id = texto(datos, "id");
  if (!proveedorId || !id) volver("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("servicios")
    .delete()
    .eq("id", id)
    .eq("proveedor_id", proveedorId)
    .select("id");

  if (error) volver(motivo(error), proveedorId);
  if (!data?.length) volver("sin-permiso", proveedorId);

  volver("servicio-borrado", proveedorId);
}
