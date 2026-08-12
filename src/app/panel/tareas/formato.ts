import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import type { EstadoTarea, PrioridadTarea } from "@/lib/bbdd/tareas";
import { t } from "@/lib/copy";

/**
 * CÓMO SE LLAMA CADA COSA, Y CÓMO SE ESCRIBE UNA FECHA
 *
 * Los enumerados de la base (`estado_tarea`, `prioridad_tarea`) son nombres
 * técnicos: `en_progreso` no se le enseña a nadie. Los copys mandan.
 */

/** La columna del tablero, en castellano. */
export function nombreDelEstado(estado: EstadoTarea): string {
  return t(`panel.tareas.estados.${estado}` as "panel.tareas.estados.pendiente");
}

/** La prioridad, en castellano. */
export function nombreDeLaPrioridad(prioridad: PrioridadTarea): string {
  return t(`panel.tareas.prioridades.${prioridad}` as "panel.tareas.prioridades.baja");
}

/**
 * Los grupos de la plantilla vienen de la BASE y no de una lista de aquí, así
 * que puede llegar uno que ningún copy conozca —añadir «boda en el extranjero»
 * es una fila, no una migración—. Cuando eso pasa se enseña su nombre crudo:
 * feo, pero cierto. `t()` con una clave inventada lanza, y una pantalla en
 * blanco por un grupo nuevo sería un precio absurdo.
 */
const NOMBRES_DE_GRUPO: Record<string, string> = {
  organizacion: "panel.tareas.grupos.organizacion",
  ceremonia_civil: "panel.tareas.grupos.ceremonia_civil",
  ceremonia_religiosa: "panel.tareas.grupos.ceremonia_religiosa",
  viaje_de_novios: "panel.tareas.grupos.viaje_de_novios",
};

export function nombreDelGrupo(grupo: string): string {
  const clave = NOMBRES_DE_GRUPO[grupo];
  return clave ? t(clave as "panel.tareas.grupos.organizacion") : grupo;
}

/*
  LAS FECHAS SE PINTAN CON MEDIODÍA DENTRO.

  `fecha_limite` es un `date` y llega como «2027-06-12». Construir
  `new Date("2027-06-12")` lo interpreta en UTC, y al pintarlo en Europe/Madrid
  una tarea del día 1 se enseña como del 31 del mes anterior en invierno y del
  día 1 en verano — es decir, a veces. Poniendo las 12:00 UTC, ningún huso de
  Europa cruza la medianoche y el día es siempre el que se escribió.
*/
const formatoDia = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

export function comoDia(fecha: string): string {
  return formatoDia.format(new Date(`${fecha.slice(0, 10)}T12:00:00Z`));
}
