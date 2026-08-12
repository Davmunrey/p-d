import "server-only";

import { DIAS_VENCE_PRONTO } from "@/config/constants";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-80/81/82 · LAS TAREAS DE LA BODA
 *
 * Lo que hoy vive en una nota del móvil y en la cabeza de dos personas. Una
 * boda son cien recados pequeños repartidos en un año, y el problema nunca es
 * acordarse de reservar la finca: es acordarse de pedir el certificado de
 * empadronamiento el mes que toca, que es el que caduca.
 *
 * «VENCIDA» Y «VENCE PRONTO» SALEN DE LA FECHA DE LA BASE, no del reloj de
 * quien mira. `v_tareas` devuelve los días que faltan contados con
 * `current_date`; aquí sólo se compara ese número contra el umbral que vive en
 * `constants.ts`. Con la cuenta hecha en el navegador, un portátil con la hora
 * mal puesta enseña vencido lo que no lo está — y al revés, que es peor.
 *
 * EL ORDEN DEL TABLERO ES `orden nulls last, prioridad desc, fecha_limite`, y
 * ese «nulls last» es la mitad de la decisión: una tarea recién creada no tiene
 * sitio elegido y cae donde le corresponde por urgencia, no la primera. Sólo
 * cuando alguien la mueve pasa a tener número propio.
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel: RLS tiene que ver quién pregunta. Un lector lee y un editor escribe, y
 * eso lo decide la base.
 */

/**
 * Las columnas del tablero, en su orden de avance.
 *
 * EL ORDEN ES EL DEL ENUMERADO `estado_tarea` de la base, no una decisión de
 * esta lista: así `order by estado` en SQL y las columnas de la pantalla dicen
 * lo mismo. Añadir una columna es una migración, no una línea aquí — inventarse
 * un valor que la base no conoce es un desplegable que falla al guardar.
 */
export const ESTADOS_TAREA = ["pendiente", "en_progreso", "hecha"] as const;

export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export function esEstadoTarea(valor: string): valor is EstadoTarea {
  return (ESTADOS_TAREA as readonly string[]).includes(valor);
}

/** El estado en el que nace una tarea, igual que el `default` de la tabla. */
export const ESTADO_INICIAL_TAREA: EstadoTarea = "pendiente";

/** La que se da por terminada. La única que sella `completada_en`. */
export const ESTADO_HECHA: EstadoTarea = "hecha";

/** De menos a más urgente, que es como lo declara `prioridad_tarea`. */
export const PRIORIDADES_TAREA = ["baja", "media", "alta", "urgente"] as const;

export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number];

export function esPrioridadTarea(valor: string): valor is PrioridadTarea {
  return (PRIORIDADES_TAREA as readonly string[]).includes(valor);
}

/** La prioridad de una tarea nueva, igual que el `default` de la tabla. */
export const PRIORIDAD_INICIAL_TAREA: PrioridadTarea = "media";

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  /** `YYYY-MM-DD` o `null`: hay tareas sin plazo, y no es un olvido. */
  fechaLimite: string | null;
  categoria: string | null;
  orden: number | null;
  responsableId: string | null;
  responsable: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  /**
   * Días que faltan según la BASE. Negativo es tarde, cero es hoy, `null` es
   * una tarea sin plazo — que no es lo mismo que una tarea a tiempo.
   */
  diasParaVencer: number | null;
}

/** Quién puede hacerse cargo de algo: los colaboradores dados de alta. */
export interface Responsable {
  id: string;
  nombre: string;
}

/** Un juego de tareas típicas de la plantilla, con cuántas trae. */
export interface GrupoPlantilla {
  grupo: string;
  cuantas: number;
}

/**
 * Las filas como llegan de PostgREST: `snake_case`. Se escriben a mano porque
 * sin los tipos generados el cliente devuelve `any`, y un `any` aquí sería
 * quedarse sin tipos justo en la pantalla que decide qué se hace esta semana.
 */
interface FilaTarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  fecha_limite: string | null;
  categoria: string | null;
  orden: number | null;
  responsable_id: string | null;
  responsable: string | null;
  proveedor_id: string | null;
  proveedor: string | null;
  dias_para_vencer: number | null;
}

/*
  EN UNA SOLA CADENA Y NO PARTIDA EN DOS. `select()` mira el literal para tipar
  lo que devuelve, y una concatenación —por legible que sea— ya no es un
  literal: el cliente pasa a devolver un error genérico en lugar de las filas, y
  el fallo aparece en el `as` de más abajo, lejos de la causa.
*/
const CAMPOS =
  "id, titulo, descripcion, estado, prioridad, fecha_limite, categoria, orden, responsable_id, responsable, proveedor_id, proveedor, dias_para_vencer";

function aTarea(fila: FilaTarea): Tarea {
  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    /*
      El enumerado se comprueba en vez de castearse. Son valores de la base y
      hoy no pueden ser otra cosa, pero el día que alguien añada un estado por
      migración, esto enseña un valor conocido en lugar de romper la pantalla
      entera con un `undefined` en el medio.
    */
    estado: esEstadoTarea(fila.estado) ? fila.estado : ESTADO_INICIAL_TAREA,
    prioridad: esPrioridadTarea(fila.prioridad) ? fila.prioridad : PRIORIDAD_INICIAL_TAREA,
    fechaLimite: fila.fecha_limite,
    categoria: fila.categoria,
    orden: fila.orden,
    responsableId: fila.responsable_id,
    responsable: fila.responsable,
    proveedorId: fila.proveedor_id,
    proveedor: fila.proveedor,
    diasParaVencer: fila.dias_para_vencer,
  };
}

/**
 * Todas las tareas, en el orden del tablero.
 *
 * Se ordena en la BASE y no en la pantalla porque el orden es el mismo en la
 * lista y en el tablero, y dos ordenaciones escritas en dos sitios acaban
 * discrepando el día que una de las dos cambia.
 */
export async function obtenerTareas(): Promise<Tarea[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_tareas")
    .select(CAMPOS)
    .order("orden", { ascending: true, nullsFirst: false })
    .order("prioridad", { ascending: false })
    .order("fecha_limite", { ascending: true, nullsFirst: false })
    .order("creado_en", { ascending: true });

  if (error) {
    console.error("No se pudieron leer las tareas:", error);
    return [];
  }

  return (data as FilaTarea[]).map(aTarea);
}

/**
 * Los colaboradores a los que se puede encargar algo.
 *
 * SÓLO LOS ACTIVOS: quien ya no entra al panel no puede hacerse cargo de nada,
 * y ofrecerlo en el desplegable es repartir trabajo a un buzón vacío. Las
 * tareas que ya tuviera siguen siendo suyas —la base las conserva— y se ven en
 * su ficha hasta que alguien las reasigne.
 */
export async function obtenerResponsables(): Promise<Responsable[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo")
    .eq("activo", true)
    .order("nombre_completo", { ascending: true });

  if (error) {
    console.error("No se pudieron leer los responsables:", error);
    return [];
  }

  return (data as { id: string; nombre_completo: string }[]).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre_completo,
  }));
}

/**
 * Los juegos de tareas que trae la plantilla, con cuántas hay en cada uno.
 *
 * SALEN DE LA TABLA Y NO DE UNA LISTA EN EL CÓDIGO. `plantilla_tareas.grupo` es
 * texto y no enumerado a propósito —añadir «boda en el extranjero» tiene que
 * ser una fila, no una migración—, así que una constante aquí convertiría cada
 * grupo nuevo en un despliegue. Se leen, se agrupan y se enseñan.
 *
 * La cuenta se hace aquí y no en una vista porque son veinticinco filas y ya
 * hay que traerlas para saber qué grupos existen: una vista de agregado sería
 * un segundo viaje para contar lo que ya está en memoria.
 */
export async function obtenerGruposPlantilla(): Promise<GrupoPlantilla[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("plantilla_tareas")
    .select("grupo")
    .order("orden", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("No se pudieron leer los grupos de la plantilla:", error);
    return [];
  }

  const cuenta = new Map<string, number>();
  for (const fila of data as { grupo: string }[]) {
    cuenta.set(fila.grupo, (cuenta.get(fila.grupo) ?? 0) + 1);
  }

  return [...cuenta].map(([grupo, cuantas]) => ({ grupo, cuantas }));
}

/** Ya pasó su fecha y sigue sin hacerse. Lo único de la lista que es tarde. */
export function estaVencida(tarea: Tarea): boolean {
  if (tarea.estado === ESTADO_HECHA || tarea.diasParaVencer === null) return false;
  return tarea.diasParaVencer < 0;
}

/** Todavía llega, pero por poco. El umbral vive en `constants.ts`. */
export function vencePronto(tarea: Tarea): boolean {
  if (tarea.estado === ESTADO_HECHA || tarea.diasParaVencer === null) return false;
  return tarea.diasParaVencer >= 0 && tarea.diasParaVencer <= DIAS_VENCE_PRONTO;
}

/** Las tareas de una columna del tablero, ya en su orden. */
export function deLaColumna(tareas: Tarea[], estado: EstadoTarea): Tarea[] {
  return tareas.filter((tarea) => tarea.estado === estado);
}
