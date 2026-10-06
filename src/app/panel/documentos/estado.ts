/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN, EN UNA FRASE
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta. Un `export type` allí compila, pasa el lint, y revienta al abrir la
 * pantalla; lo vigila `tests/unidad/acciones-servidor.test.ts`.
 *
 * Los éxitos van en participio y los errores llevan el nombre de lo que falla,
 * que es como se leen luego en `aviso.tsx` y en la URL.
 */

export type EstadoDocumentos =
  | "apuntado"
  | "editado"
  | "borrado"
  | "conseguido"
  | "titulo"
  | "de-quien"
  | "estado-invalido"
  | "sin-fecha-obtencion"
  | "fecha"
  | "confirmar-borrado"
  | "no-existe"
  | "sin-permiso"
  | "error";

/** El sitio de cada papel en la pantalla: a él vuelve lo que se hace sobre él. */
export function anclaDeDocumento(id: string): string {
  return `documento-${id}`;
}

/** El alta, al final de la pantalla: sus errores se pintan junto a ella. */
export const ANCLA_ALTA_DOCUMENTO = "nuevo-documento";

/** Lo que dice en la URL que un aviso viene del alta y no de un papel concreto. */
export const DESDE_EL_ALTA = { desde: "alta" } as const;
