/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN, EN UNA FRASE
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta. Un `export type` allí compila, pasa el lint, y revienta al abrir la
 * pantalla.
 *
 * Los éxitos van en participio y los fallos llevan el nombre del campo que los
 * provoca: `titulo` es «falta el título», no «se ha guardado el título».
 */

export type EstadoTareas =
  | "creada"
  | "editada"
  | "duplicada"
  | "borrada"
  | "completada"
  | "estado-cambiado"
  | "movida"
  | "generadas"
  | "ya-estaban"
  | "titulo"
  | "fecha"
  | "prioridad"
  | "estado"
  | "sin-grupos"
  | "sin-mover"
  | "confirmar-borrado"
  | "no-existe"
  | "en-uso"
  | "referencia-rota"
  | "sin-permiso"
  | "error";

/**
 * A DÓNDE VUELVE LA PANTALLA TRAS UNA ACCIÓN, y dónde se pinta su aviso.
 *
 * Toda acción volvía al principio: confirmar un borrado obligaba a bajar tres
 * pantallas hasta la tarjeta, y subir una tarjeta tres puestos, a buscarla tres
 * veces. Cada acción vuelve a la tarjeta que tocó, o al alta, o a la plantilla.
 */
export function anclaDeTarea(id: string): string {
  return `tarea-${id}`;
}

export const ANCLA_ALTA_TAREA = "nueva-tarea";
export const ANCLA_PLANTILLA = "plantilla";

/** De qué formulario sin tarjeta viene el aviso: el alta o la plantilla. */
export const DESDE = { alta: "alta", plantilla: "plantilla" } as const;
