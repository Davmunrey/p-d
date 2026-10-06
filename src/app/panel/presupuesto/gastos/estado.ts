/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN SOBRE UN GASTO.
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta.
 */
export type EstadoGastos =
  | "gasto-creado"
  | "gasto-editado"
  | "gasto-borrado"
  | "confirmar-borrado"
  | "concepto"
  | "categoria"
  | "importe"
  | "sin-categorias"
  | "no-existe"
  | "tiene-pagos"
  | "por-debajo-de-pagos"
  | "referencia-rota"
  | "sin-permiso"
  | "error";

/** El sitio de cada gasto en la pantalla: a él vuelve lo que se hace sobre él. */
export function anclaDeGasto(id: string): string {
  return `gasto-${id}`;
}

/** El alta de un gasto, al final de la pantalla: sus errores se pintan junto a ella. */
export const ANCLA_ALTA_GASTO = "nuevo-gasto";

/** Lo que dice en la URL que un aviso viene del alta y no de un gasto concreto. */
export const DESDE_EL_ALTA = { desde: "alta" } as const;
