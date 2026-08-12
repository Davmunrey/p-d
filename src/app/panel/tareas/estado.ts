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
  | "sin-permiso"
  | "error";
