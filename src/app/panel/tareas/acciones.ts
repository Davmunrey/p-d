"use server";

import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_TAREAS } from "@/config/constants";
import {
  deLaColumna,
  esEstadoTarea,
  esPrioridadTarea,
  ESTADO_HECHA,
  ESTADO_INICIAL_TAREA,
  obtenerTareas,
  PRIORIDAD_INICIAL_TAREA,
} from "@/lib/bbdd/tareas";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoTareas } from "./estado";

/**
 * BODA-80/81/82 · LAS TAREAS, DESDE EL PANEL
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE, no este fichero. La política
 * `tareas_editor_escribir` exige `puede_editar()`. Aquí sólo se traduce ese
 * «no» a una frase en castellano y se evita ofrecer un botón que va a fallar.
 *
 * OJO CON EL SILENCIO DE RLS: una escritura prohibida no da error, devuelve
 * cero filas tocadas. Por eso cada operación pide de vuelta lo que ha escrito y
 * mira si ha venido algo, en lugar de conformarse con que `error` sea nulo.
 *
 * `completada_en` NO SE ESCRIBE DESDE AQUÍ, y es a propósito: lo pone y lo
 * quita el trigger `sellar_tarea_completada` a partir del estado. Mandarlo
 * desde el cliente sería un segundo sitio donde acordarse, y el `check`
 * `tareas_completada_coherente` no perdona el despiste.
 *
 * TODO VUELVE A `/panel/tareas` CON SU `?estado=`, así que no se revalida esa
 * ruta: `revalidatePath` de la ruta destino y `redirect` a esa misma ruta
 * compiten, y lo que se pierde es la query — el aviso desaparece y quien acaba
 * de guardar no sabe si guardó. La pantalla es `force-dynamic`: la redirección
 * ya la vuelve a leer entera de la base.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/** `""` se convierte en `null`: un campo opcional vacío es ausencia, no cadena vacía. */
function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/**
 * A dónde se vuelve, con qué contar y sin perder de vista dónde estaba quien lo
 * pulsó.
 *
 * `vista` viaja en cada formulario porque mover una tarjeta desde el tablero y
 * acabar en la lista es perder el sitio: se estaba ordenando una columna y de
 * repente hay que volver a buscarla. `tarea` marca a cuál se le está
 * preguntando algo, que es lo que permite que la confirmación de borrado salga
 * en la tarjeta correcta y no en las veinte.
 */
function volver(
  estado: EstadoTareas,
  opciones: { vista?: string; tarea?: string; creadas?: number } = {},
): never {
  const consulta = new URLSearchParams();
  if (opciones.vista) consulta.set("vista", opciones.vista);
  consulta.set("estado", estado);
  if (opciones.tarea) consulta.set("tarea", opciones.tarea);
  if (opciones.creadas !== undefined) consulta.set("creadas", String(opciones.creadas));

  redirect(`${RUTA_TAREAS}?${consulta.toString()}`);
}

/** La vista desde la que se envió el formulario, para volver a ella. */
function vistaDe(datos: FormData): string | undefined {
  return texto(datos, "vista") || undefined;
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
function motivo(error: { code?: string; message?: string }): EstadoTareas {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  if (error.code === "23503") return "en-uso";
  console.error("Fallo escribiendo en tareas:", error);
  return "error";
}

/** Lo más largo que admite `tareas_titulo_longitud`. */
const LARGO_TITULO = 160;

/**
 * Los campos que comparten el alta y la edición, ya validados.
 *
 * LA FECHA SE COMPRUEBA AUNQUE EL CAMPO SEA `type="date"`. El navegador impide
 * teclear un 31 de febrero, pero un formulario enviado desde fuera del
 * navegador no pasa por ese filtro y la base contestaría con un error de
 * PostgREST que no dice nada. Aquí contesta una frase.
 */
function camposTarea(datos: FormData):
  | { ok: false; estado: EstadoTareas }
  | {
      ok: true;
      valores: {
        titulo: string;
        descripcion: string | null;
        categoria: string | null;
        prioridad: string;
        fecha_limite: string | null;
        responsable_id: string | null;
        proveedor_id: string | null;
      };
    } {
  const titulo = texto(datos, "titulo");
  if (!titulo || titulo.length > LARGO_TITULO) return { ok: false, estado: "titulo" };

  const prioridad = texto(datos, "prioridad") || PRIORIDAD_INICIAL_TAREA;
  if (!esPrioridadTarea(prioridad)) return { ok: false, estado: "prioridad" };

  const fecha = opcional(datos, "fecha_limite");
  if (
    fecha !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)))
  ) {
    return { ok: false, estado: "fecha" };
  }

  return {
    ok: true,
    valores: {
      titulo,
      descripcion: opcional(datos, "descripcion"),
      categoria: opcional(datos, "categoria"),
      prioridad,
      fecha_limite: fecha,
      responsable_id: opcional(datos, "responsable_id"),
      proveedor_id: opcional(datos, "proveedor_id"),
    },
  };
}

export async function crearTarea(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);
  const campos = camposTarea(datos);
  if (!campos.ok) volver(campos.estado, { vista });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("tareas")
    /*
      NACE PENDIENTE Y SIN SITIO. `orden` se queda nulo a propósito: la tarea
      cae donde le toca por prioridad y fecha, que es el orden natural, y sólo
      pasa a tener número cuando alguien la mueve a mano. Con un cero, todas las
      nuevas se apilarían empatadas en la primera posición.
    */
    .insert({ ...campos.valores, estado: ESTADO_INICIAL_TAREA })
    .select("id");

  if (error) volver(motivo(error), { vista });
  if (!data?.length) volver("sin-permiso", { vista });

  volver("creada", { vista });
}

export async function editarTarea(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);
  const id = texto(datos, "id");
  if (!id) volver("no-existe", { vista });

  const campos = camposTarea(datos);
  if (!campos.ok) volver(campos.estado, { vista });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("tareas")
    .update(campos.valores)
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), { vista });
  if (!data?.length) volver("sin-permiso", { vista });

  volver("editada", { vista });
}

/**
 * COMPLETAR, REABRIR Y MOVER SON LA MISMA OPERACIÓN, y por eso son una sola
 * acción: las tres escriben `estado` y nada más.
 *
 * Es además lo que hace que el tablero funcione SIN RATÓN Y SIN JAVASCRIPT.
 * Cada tarjeta lleva un botón por columna de destino: un `<form>` con su
 * `<button>`, que se alcanza con el tabulador y se dispara con Enter. Arrastrar
 * es cómodo con ratón y es imposible sin él.
 */
export async function cambiarEstadoTarea(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);
  const id = texto(datos, "id");
  if (!id) volver("no-existe", { vista });

  const nuevo = texto(datos, "estado");
  if (!esEstadoTarea(nuevo)) volver("estado", { vista });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("tareas")
    // `completada_en` lo pone y lo quita el trigger. Ver la cabecera.
    .update({ estado: nuevo })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), { vista });
  if (!data?.length) volver("sin-permiso", { vista });

  volver(nuevo === ESTADO_HECHA ? "completada" : "estado-cambiado", { vista });
}

/**
 * DUPLICAR: las tareas que se repiten, sin reescribirlas.
 *
 * «Pagar el plazo del catering» pasa tres veces y «llamar a la floristería»,
 * cuatro. Volver a teclear el título, la categoría, el proveedor y quién se
 * encarga es exactamente el trabajo que esta pantalla existe para ahorrar.
 *
 * LA COPIA NACE PENDIENTE Y SIN FECHA. Lo primero es obvio; lo segundo no, y es
 * la decisión que hace útil el botón: una tarea que se repite se repite en OTRA
 * fecha, y heredar la del mes pasado haría nacer la copia vencida, en rojo y
 * mintiendo. Se pone la nueva al editarla, que es el único dato que de verdad
 * cambia.
 *
 * Y NO SE COPIA `plantilla_id`. Es el rastro de qué fila de la plantilla generó
 * la tarea, y hay un índice único que sólo admite una tarea por fila: copiarlo
 * haría fallar el duplicado justo en las tareas que vinieron de la plantilla,
 * que son las más repetibles de todas.
 */
export async function duplicarTarea(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);
  const id = texto(datos, "id");
  if (!id) volver("no-existe", { vista });

  const supabase = await cliente();

  const { data: original, error: fallo } = await supabase
    .from("tareas")
    .select("titulo, descripcion, categoria, prioridad, responsable_id, proveedor_id")
    .eq("id", id)
    .maybeSingle<{
      titulo: string;
      descripcion: string | null;
      categoria: string | null;
      prioridad: string;
      responsable_id: string | null;
      proveedor_id: string | null;
    }>();

  if (fallo) volver(motivo(fallo), { vista });
  if (!original) volver("no-existe", { vista });

  const { data, error } = await supabase
    .from("tareas")
    .insert({ ...original, estado: ESTADO_INICIAL_TAREA })
    .select("id");

  if (error) volver(motivo(error), { vista });
  if (!data?.length) volver("sin-permiso", { vista });

  volver("duplicada", { vista });
}

/**
 * BORRAR PREGUNTA ANTES, Y LA PREGUNTA VIAJA POR `POST`.
 *
 * Sin `confirm()` del navegador, que no existe sin JavaScript y que un lector
 * de pantalla anuncia fatal. El primer envío no borra: devuelve el aviso y
 * marca la tarea en la URL, y la pantalla pinta el botón que ya trae la
 * confirmación dentro. Dos pasos, los dos por `POST`.
 */
export async function borrarTarea(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);
  const id = texto(datos, "id");
  if (!id) volver("no-existe", { vista });

  if (texto(datos, "confirmar") !== "si") volver("confirmar-borrado", { vista, tarea: id });

  const supabase = await cliente();
  const { data, error } = await supabase.from("tareas").delete().eq("id", id).select("id");

  if (error) volver(motivo(error), { vista });
  if (!data?.length) volver("sin-permiso", { vista });

  volver("borrada", { vista });
}

/**
 * SUBIR Y BAJAR DENTRO DE LA COLUMNA
 *
 * El orden de una columna del tablero no es el de la base de datos: es el que
 * decide quien organiza, «esto primero aunque venza después». Se guarda en
 * `tareas.orden` para que sobreviva a la recarga.
 *
 * SE PERMUTA CON EL VECINO Y NO SE ARRASTRA. Dos botones se alcanzan con el
 * tabulador; arrastrar no. Y con la lista ya ordenada delante, permutar es
 * exacto: no hay que inventarse un hueco entre dos números.
 *
 * LA PRIMERA VEZ SE NUMERA LA COLUMNA ENTERA, y no es un desperdicio: al
 * principio todas las tareas tienen `orden` nulo —caen por prioridad y fecha— y
 * permutar dos nulos no significa nada. Se escribe la posición de cada una tal
 * y como se está viendo, con las dos ya intercambiadas, y a partir de ahí cada
 * movimiento toca sólo dos filas: las que de verdad cambian de sitio.
 */
export async function moverTarea(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);
  const id = texto(datos, "id");
  if (!id) volver("no-existe", { vista });

  const direccion = texto(datos, "direccion");
  const haciaArriba = direccion === "subir";
  if (!haciaArriba && direccion !== "bajar") volver("sin-mover", { vista });

  /*
    Se lee la lista ENTERA por el mismo camino que la pinta la pantalla. Repetir
    aquí el `order by` sería tener el orden escrito en dos sitios, y el día que
    uno de los dos cambie, el botón de subir movería la tarjeta a un sitio que
    no es el de arriba.
  */
  const tareas = await obtenerTareas();
  const actual = tareas.find((tarea) => tarea.id === id);
  if (!actual) volver("no-existe", { vista });

  const columna = deLaColumna(tareas, actual.estado);
  const desde = columna.findIndex((tarea) => tarea.id === id);
  const hasta = haciaArriba ? desde - 1 : desde + 1;
  if (hasta < 0 || hasta >= columna.length) volver("sin-mover", { vista });

  const orden = columna.map((tarea) => tarea.id);
  [orden[desde], orden[hasta]] = [orden[hasta], orden[desde]];

  const supabase = await cliente();

  for (const [posicion, tareaId] of orden.entries()) {
    const tarea = columna.find((candidata) => candidata.id === tareaId);
    // Ya está donde tiene que estar: una escritura que no cambia nada es una
    // fila auditada de más y una ronda de red que no hacía falta.
    if (tarea?.orden === posicion) continue;

    const { data, error } = await supabase
      .from("tareas")
      .update({ orden: posicion })
      .eq("id", tareaId)
      .select("id");

    if (error) volver(motivo(error), { vista });
    if (!data?.length) volver("sin-permiso", { vista });
  }

  volver("movida", { vista });
}

/**
 * BODA-82 · EMPEZAR CON LA LISTA PUESTA
 *
 * La cuenta la hace la base: `generar_tareas_desde_plantilla` crea sólo lo que
 * falta —lo garantiza `plantilla_id` con su índice único— y devuelve cuántas ha
 * creado. Por eso generar dos veces no duplica nada, y por eso se puede decir
 * «0 creadas» con seguridad en lugar de un «hecho» que no distingue haber
 * creado veinte de no haber creado ninguna.
 *
 * SE ELIGE POR GRUPOS Y NO TAREA A TAREA porque la primera vez nadie sabe
 * cuáles de veinticinco tareas le tocan — pero sí sabe qué boda tiene. Los
 * grupos salen de la propia tabla, así que uno nuevo aparece en la pantalla sin
 * tocar código.
 */
export async function generarDesdePlantilla(datos: FormData): Promise<void> {
  const vista = vistaDe(datos);

  const grupos = datos
    .getAll("grupos")
    .map((valor) => String(valor).trim())
    .filter(Boolean);

  if (grupos.length === 0) volver("sin-grupos", { vista });

  const supabase = await cliente();
  const { data, error } = await supabase.rpc("generar_tareas_desde_plantilla", {
    p_grupos: grupos,
  });

  if (error) volver(motivo(error), { vista });

  const creadas = Number(data ?? 0);
  if (!Number.isFinite(creadas) || creadas <= 0) volver("ya-estaban", { vista, creadas: 0 });

  volver("generadas", { vista, creadas });
}
