"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LONGITUD_MINIMA_NOMBRE, RUTA_ACCESO, RUTA_PROVEEDORES } from "@/config/constants";
import {
  ESTADO_INICIAL_PROVEEDOR,
  esEstadoProveedor,
  obtenerContratadosDeCategoria,
} from "@/lib/bbdd/proveedores";
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
 * Se distinguen tres cosas que no son iguales: vacío (no hay importe, `null`),
 * un número, y algo que no es un número (`undefined`, que la pantalla convierte
 * en error). Devolver `null` para lo ilegible borraría en silencio el importe
 * que alguien acaba de teclear mal.
 */
function importe(datos: FormData, campo: string): number | null | undefined {
  const bruto = texto(datos, campo);
  if (!bruto) return null;

  // Se quitan los separadores de millar y la coma decimal pasa a punto. El
  // euro y los espacios se caen también: se pegan desde un presupuesto en PDF.
  const limpio = bruto
    .replace(/[€\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero < 0) return undefined;

  // Dos decimales, como `numeric(12,2)`. Redondear aquí evita que la base
  // rechace un céntimo de más venido de una división.
  return Math.round(numero * 100) / 100;
}

function volver(estado: EstadoProveedores, proveedorId?: string): never {
  const base = proveedorId ? `${RUTA_PROVEEDORES}/${proveedorId}` : RUTA_PROVEEDORES;
  redirect(`${base}?estado=${estado}`);
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

  revalidatePath(RUTA_PROVEEDORES);
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

  revalidatePath(RUTA_PROVEEDORES);
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
  revalidatePath(`${RUTA_PROVEEDORES}/${id}`);
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
  revalidatePath(`${RUTA_PROVEEDORES}/${id}`);
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

  revalidatePath(RUTA_PROVEEDORES);
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

  revalidatePath(`${RUTA_PROVEEDORES}/${proveedorId}`);
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

  revalidatePath(`${RUTA_PROVEEDORES}/${proveedorId}`);
  volver("contacto-quitado", proveedorId);
}
